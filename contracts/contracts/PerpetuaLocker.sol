// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IVeBTC} from "./interfaces/IVeBTC.sol";
import {IVoter} from "./interfaces/IVoter.sol";
import {LveBTC} from "./LveBTC.sol";

/// @title PerpetuaLocker
/// @notice Aggregates BTC deposits into a single, perpetually-locked veBTC position
///         and issues liquid `lveBTC` against it.
///
/// Why this exists: Mezo's veBTC has a 28-day maximum lock, its weight decays
/// linearly to zero, boost must be manually poked, and unclaimed fees and
/// incentives are forfeited each epoch. That makes veBTC a wasting, high-upkeep,
/// illiquid asset, and it puts the 5x boost out of reach of small holders. Perpetua
/// holds one large position that never decays, votes it as a bloc, and hands
/// depositors a liquid ERC-20 instead of a 28-day lock.
///
/// Trust assumptions, stated plainly:
///  - Deposits are IRREVERSIBLE. The position is permanent, so there is no
///    redemption path. lveBTC holders exit by selling, like Convex's cvxCRV.
///  - Vote direction and reward harvesting are `operator`-gated in this version.
///    Making them permissionless/auction-driven is the next milestone.
///  - Lock upkeep (`extendLock`, `poke`) is permissionless, so the position can
///    never be stranded by an absent operator.
contract PerpetuaLocker is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Mezo's veBTC voting escrow.
    IVeBTC public immutable veBTC;
    /// @notice Mezo's VeBTCVoter.
    IVoter public immutable voter;
    /// @notice The escrowed asset (BTC on Mezo).
    IERC20 public immutable btc;
    /// @notice Liquid receipt token, deployed here so both links are immutable.
    LveBTC public immutable lveBTC;

    /// @notice The single veNFT this contract owns. Zero until the first deposit.
    uint256 public tokenId;
    /// @notice True once the position has been converted to a permanent lock.
    bool public isPermanent;

    /// @notice May direct votes and harvest rewards.
    address public operator;
    /// @notice Destination for harvested reward tokens (the MUSD streamer).
    address public rewardSink;

    /// @dev Comfortably inside Mezo's 28-day MAXTIME while still rounding up to a
    ///      future week boundary. Only used for the very first lock, which is
    ///      converted to permanent immediately afterwards.
    uint256 public constant INITIAL_LOCK_DURATION = 14 days;
    /// @dev Mezo's veBTC MAXTIME. Used by the `extendLock` fallback path.
    uint256 public constant MAX_LOCK_DURATION = 28 days;

    event Deposited(address indexed caller, address indexed receiver, uint256 amount, uint256 tokenId);
    event PositionOpened(uint256 tokenId, uint256 amount);
    event MadePermanent(uint256 tokenId);
    event LockExtended(uint256 tokenId, uint256 newEnd);
    event Voted(address[] pools, uint256[] weights);
    event Harvested(address indexed token, uint256 amount, address sink);
    event OperatorSet(address operator);
    event RewardSinkSet(address sink);

    error ZeroAmount();
    error ZeroAddress();
    error OnlyOperator();
    error NoPosition();
    error SinkNotSet();
    error LengthMismatch();
    error AlreadyPermanent();

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert OnlyOperator();
        _;
    }

    constructor(address _veBTC, address _voter, address _owner, address _operator) Ownable(_owner) {
        if (_veBTC == address(0) || _voter == address(0)) revert ZeroAddress();
        veBTC = IVeBTC(_veBTC);
        voter = IVoter(_voter);
        // Read the escrowed asset from the escrow itself rather than trusting a
        // constructor argument. On Mezo testnet this resolves to 0x7b7C..0000.
        btc = IERC20(IVeBTC(_veBTC).token());
        lveBTC = new LveBTC(address(this));
        operator = _operator;
        emit OperatorSet(_operator);
    }

    // ---------------------------------------------------------------- deposits

    /// @notice Locks `amount` BTC forever and mints `amount` lveBTC to `receiver`.
    /// @dev 1:1 accounting is deliberate. Because deposits can never be redeemed,
    ///      there is no NAV to compute and therefore no share-price to manipulate.
    /// @return minted The amount of lveBTC minted (always equal to `amount`).
    function deposit(uint256 amount, address receiver) external nonReentrant returns (uint256 minted) {
        if (amount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        btc.safeTransferFrom(msg.sender, address(this), amount);
        btc.forceApprove(address(veBTC), amount);

        uint256 id = tokenId;
        if (id == 0) {
            id = veBTC.createLock(amount, INITIAL_LOCK_DURATION);
            tokenId = id;
            emit PositionOpened(id, amount);
            _tryMakePermanent(id);
        } else {
            // A decaying lock must be live before it can be topped up.
            if (!isPermanent) _ensureLockHealthy(id);
            veBTC.increaseAmount(id, amount);
        }

        lveBTC.mint(receiver, amount);
        emit Deposited(msg.sender, receiver, amount, id);
        return amount;
    }

    // ------------------------------------------------------------ lock upkeep

    /// @notice Attempts to convert the position to a permanent lock.
    /// @dev Permissionless and idempotent. Exists because `lockPermanent` may be
    ///      gated on some deployments; if the first attempt at deposit time failed,
    ///      anyone can retry later without privileges.
    function makePermanent() external {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        if (isPermanent) revert AlreadyPermanent();
        _tryMakePermanent(id);
    }

    /// @notice Pushes a decaying lock back out to MAXTIME. No-op when permanent.
    /// @dev Permissionless: keeping the bloc's weight alive benefits every holder,
    ///      so it must not depend on the operator being online.
    function extendLock() external {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        if (isPermanent) return;
        _ensureLockHealthy(id);
    }

    /// @notice Refreshes the recorded voting weight of the position.
    function poke() external {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        voter.poke(id);
    }

    function _tryMakePermanent(uint256 id) internal {
        try veBTC.lockPermanent(id) {
            isPermanent = true;
            emit MadePermanent(id);
        } catch {
            // Left as a decaying lock; `extendLock` keeps it at MAXTIME instead.
        }
    }

    function _ensureLockHealthy(uint256 id) internal {
        IVeBTC.LockedBalance memory lock = veBTC.locked(id);
        if (lock.isPermanent) {
            isPermanent = true;
            return;
        }
        // Only extend when it would actually move the end date forward; otherwise
        // the escrow reverts.
        uint256 target = block.timestamp + MAX_LOCK_DURATION;
        if (target > lock.end) {
            veBTC.increaseUnlockTime(id, MAX_LOCK_DURATION);
            emit LockExtended(id, veBTC.locked(id).end);
        }
    }

    // ----------------------------------------------------------------- voting

    /// @notice Allocates the bloc's weight across gauges for the current epoch.
    function vote(address[] calldata pools, uint256[] calldata weights) external onlyOperator {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        if (pools.length != weights.length) revert LengthMismatch();
        voter.vote(id, pools, weights);
        emit Voted(pools, weights);
    }

    /// @notice Clears the bloc's current vote allocation.
    function resetVote() external onlyOperator {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        voter.reset(id);
    }

    // ---------------------------------------------------------------- harvest

    /// @notice Claims trading fees and incentives accrued to the position.
    /// @dev Operator-gated because the reward-contract addresses are caller-supplied
    ///      and the Voter does not validate them.
    function harvest(
        address[] calldata feeContracts,
        address[][] calldata feeTokens,
        address[] calldata bribeContracts,
        address[][] calldata bribeTokens
    ) external onlyOperator {
        uint256 id = tokenId;
        if (id == 0) revert NoPosition();
        if (feeContracts.length > 0) voter.claimFees(feeContracts, feeTokens, id);
        if (bribeContracts.length > 0) voter.claimBribes(bribeContracts, bribeTokens, id);
    }

    /// @notice Forwards a harvested token to the reward sink.
    /// @dev Permissionless. There is never idle BTC here between transactions --
    ///      `deposit` locks it in the same call -- so sweeping BTC (a real fee
    ///      token for the MUSD/BTC gauge) is safe.
    function sweep(address token) external returns (uint256 amount) {
        address sink = rewardSink;
        if (sink == address(0)) revert SinkNotSet();
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return 0;
        IERC20(token).safeTransfer(sink, amount);
        emit Harvested(token, amount, sink);
    }

    // ------------------------------------------------------------------ views

    /// @notice Current non-decaying voting weight of the bloc.
    function votingPower() external view returns (uint256) {
        uint256 id = tokenId;
        if (id == 0) return 0;
        return veBTC.balanceOfNFT(id);
    }

    /// @notice Total BTC locked by the protocol. Equals lveBTC total supply.
    function totalLocked() external view returns (uint256) {
        uint256 id = tokenId;
        if (id == 0) return 0;
        int128 amount = veBTC.locked(id).amount;
        return amount < 0 ? 0 : uint256(uint128(amount));
    }

    /// @notice The position's lock record.
    function lockInfo() external view returns (IVeBTC.LockedBalance memory) {
        return veBTC.locked(tokenId);
    }

    // --------------------------------------------------------------- admin

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function setRewardSink(address _sink) external onlyOwner {
        if (_sink == address(0)) revert ZeroAddress();
        rewardSink = _sink;
        emit RewardSinkSet(_sink);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IRouter} from "./interfaces/IRouter.sol";

/// @title MUSDRewardStreamer
/// @notice Stake lveBTC, earn MUSD.
///
/// Everything the bloc earns -- trading fees from the MUSD gauges, external
/// incentives, chain fees -- is converted to MUSD here and streamed to stakers over
/// one epoch. That is what makes lveBTC a BTC-denominated position paying a
/// dollar coupon: MUSD is the unit of account for the whole protocol's yield.
///
/// Mechanism is the Synthetix StakingRewards accumulator, chosen because it is
/// heavily audited and widely understood. Staking (rather than rebasing lveBTC)
/// keeps the liquid token a plain ERC-20, so it stays composable as collateral.
contract MUSDRewardStreamer is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The staked token (lveBTC).
    IERC20 public immutable stakingToken;
    /// @notice The reward token (MUSD).
    IERC20 public immutable musd;
    /// @notice Mezo's Router, used to convert harvested tokens into MUSD.
    IRouter public immutable router;

    /// @notice May start reward streams.
    address public operator;

    /// @notice Stream length. One Mezo epoch.
    uint256 public rewardsDuration = 7 days;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    /// @dev Solvency bookkeeping. `musd.balanceOf(this)` must always cover
    ///      `totalRewardsAdded - totalRewardsPaid`, i.e. every obligation we have
    ///      promised but not yet handed out.
    uint256 public totalRewardsAdded;
    uint256 public totalRewardsPaid;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event RewardAdded(uint256 amount, uint256 periodFinish);
    event Converted(address indexed tokenIn, uint256 amountIn, uint256 musdOut);
    event OperatorSet(address operator);
    event RewardsDurationSet(uint256 duration);

    error ZeroAmount();
    error ZeroAddress();
    error OnlyOperator();
    error InsufficientBalance();
    error Insolvent();
    error PeriodStillActive();
    error BadDuration();
    error CannotRecoverCoreAsset();
    error NothingToConvert();

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert OnlyOperator();
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address _stakingToken, address _musd, address _router, address _owner, address _operator)
        Ownable(_owner)
    {
        if (_stakingToken == address(0) || _musd == address(0) || _router == address(0)) revert ZeroAddress();
        stakingToken = IERC20(_stakingToken);
        musd = IERC20(_musd);
        router = IRouter(_router);
        operator = _operator;
        emit OperatorSet(_operator);
    }

    // ------------------------------------------------------------------ views

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored
            + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / totalSupply;
    }

    function earned(address account) public view returns (uint256) {
        return (balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18
            + rewards[account];
    }

    /// @notice MUSD that will be distributed over the remainder of the current stream.
    function rewardForDuration() external view returns (uint256) {
        return rewardRate * rewardsDuration;
    }

    // --------------------------------------------------------------- staking

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        totalSupply += amount;
        balanceOf[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward == 0) return;
        rewards[msg.sender] = 0;
        totalRewardsPaid += reward;
        musd.safeTransfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    /// @notice Withdraw everything and claim.
    function exit() external {
        withdraw(balanceOf[msg.sender]);
        getReward();
    }

    // --------------------------------------------------------------- rewards

    /// @notice Starts (or tops up) a MUSD reward stream.
    /// @dev The MUSD must already be held by this contract; the locker's `sweep`
    ///      sends it here. We verify solvency rather than pulling funds, so a
    ///      stream can never be promised that the contract cannot pay.
    function notifyRewardAmount(uint256 reward) external onlyOperator {
        _notifyRewardAmount(reward);
    }

    /// @notice Swaps a harvested token held here into MUSD and streams the proceeds.
    /// @param tokenIn The harvested token to convert (e.g. BTC from the MUSD/BTC gauge).
    /// @param routes Router hops ending in MUSD.
    /// @param minOut Slippage bound, enforced by the Router.
    function convertAndNotify(address tokenIn, IRouter.Route[] calldata routes, uint256 minOut)
        external
        onlyOperator
        returns (uint256 musdOut)
    {
        uint256 amountIn = IERC20(tokenIn).balanceOf(address(this));
        if (amountIn == 0) revert NothingToConvert();

        uint256 before = musd.balanceOf(address(this));
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        router.swapExactTokensForTokens(amountIn, minOut, routes, address(this), block.timestamp);
        musdOut = musd.balanceOf(address(this)) - before;

        emit Converted(tokenIn, amountIn, musdOut);
        _notifyRewardAmount(musdOut);
    }

    function _notifyRewardAmount(uint256 reward) internal updateReward(address(0)) {
        if (reward == 0) revert ZeroAmount();

        // Roll any undistributed remainder of the current stream into the new one.
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 leftover = (periodFinish - block.timestamp) * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        totalRewardsAdded += reward;
        // Every promised-but-unpaid MUSD must be on hand.
        if (musd.balanceOf(address(this)) < totalRewardsAdded - totalRewardsPaid) revert Insolvent();

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardAdded(reward, periodFinish);
    }

    // ----------------------------------------------------------------- admin

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function setRewardsDuration(uint256 _duration) external onlyOwner {
        if (block.timestamp < periodFinish) revert PeriodStillActive();
        if (_duration < 1 days || _duration > 28 days) revert BadDuration();
        rewardsDuration = _duration;
        emit RewardsDurationSet(_duration);
    }

    /// @notice Rescues a stray token. Cannot touch staked principal or promised MUSD.
    function recover(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(stakingToken)) revert CannotRecoverCoreAsset();
        if (token == address(musd)) {
            uint256 obligations = totalRewardsAdded - totalRewardsPaid;
            if (musd.balanceOf(address(this)) - amount < obligations) revert Insolvent();
        }
        IERC20(token).safeTransfer(to, amount);
    }
}

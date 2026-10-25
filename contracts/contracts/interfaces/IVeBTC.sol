// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Subset of Mezo's VeBTC (Tigris) voting-escrow interface that Perpetua depends on.
/// @dev ABI taken from mezo-org/tigris `solidity/deployments/testnet/VeBTC.json`.
///      Testnet: 0xB63fcCd03521Cf21907627bd7fA465C129479231
///      Mainnet: 0x7D807e9CE1ef73048FEe9A4214e75e894ea25914
interface IVeBTC {
    /// @dev Mirrors IVotingEscrow.LockedBalance exactly; `amount` is int128 upstream.
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
    }

    /// @notice Locks `_value` of the escrow token for `_lockDuration` and mints a veNFT.
    function createLock(uint256 _value, uint256 _lockDuration) external returns (uint256);

    /// @notice Adds `_value` to an existing lock without changing its end date.
    function increaseAmount(uint256 _tokenId, uint256 _value) external;

    /// @notice Pushes the lock end further out, up to the escrow's MAXTIME.
    function increaseUnlockTime(uint256 _tokenId, uint256 _lockDuration) external;

    /// @notice Converts a lock into a permanent (non-decaying) lock.
    function lockPermanent(uint256 _tokenId) external;

    /// @notice Reverses `lockPermanent`, restoring a decaying lock.
    function unlockPermanent(uint256 _tokenId) external;

    /// @notice Merges veNFT `_from` into `_to`. One-way; `_from` is burned.
    function merge(uint256 _from, uint256 _to) external;

    /// @notice Current voting weight of a veNFT (decays unless permanent).
    function balanceOfNFT(uint256 _tokenId) external view returns (uint256);

    /// @notice Raw lock record: amount, end timestamp, and permanent flag.
    function locked(uint256 _tokenId) external view returns (LockedBalance memory);

    /// @notice The ERC-20 locked by this escrow. On Mezo this is BTC.
    function token() external view returns (address);

    /// @notice The Voter contract authorised to record votes against veNFTs.
    function voter() external view returns (address);

    /// @notice True while a veNFT has an active vote this epoch.
    function voted(uint256 _tokenId) external view returns (bool);

    function ownerOf(uint256 _tokenId) external view returns (address);

    function transferFrom(address _from, address _to, uint256 _tokenId) external;

    function approve(address _approved, uint256 _tokenId) external;
}

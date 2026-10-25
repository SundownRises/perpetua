// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Subset of Mezo's VeBTCVoter (Tigris) interface that Perpetua depends on.
/// @dev ABI taken from mezo-org/tigris `solidity/deployments/testnet/VeBTCVoter.json`.
///      Testnet: 0x72F8dd7F44fFa19E45955aa20A5486E8EB255738
///      Mainnet: 0x3A4a6919F70e5b0aA32401747C471eCfe2322C1b
interface IVoter {
    /// @notice Allocates a veNFT's weight across pools for the current epoch.
    function vote(uint256 _tokenId, address[] calldata _poolVote, uint256[] calldata _weights) external;

    /// @notice Clears a veNFT's votes. Required before merging or re-voting in some flows.
    function reset(uint256 _tokenId) external;

    /// @notice Refreshes a veNFT's recorded weight after its balance changes.
    function poke(uint256 _tokenId) external;

    /// @notice Claims trading fees accrued to a veNFT from the given fee contracts.
    function claimFees(address[] calldata _fees, address[][] calldata _tokens, uint256 _tokenId) external;

    /// @notice Claims external incentives ("bribes") accrued to a veNFT.
    function claimBribes(address[] calldata _bribes, address[][] calldata _tokens, uint256 _tokenId) external;

    /// @notice Gauge registered for a pool, or address(0) if none.
    function gauges(address _pool) external view returns (address);

    /// @notice The FeesVotingReward contract paired with a gauge.
    function gaugeToFees(address _gauge) external view returns (address);

    /// @notice The BribeVotingReward contract paired with a gauge.
    function gaugeToBribe(address _gauge) external view returns (address);

    /// @notice Number of pools registered with the voter.
    function pools(uint256 _index) external view returns (address);

    function length() external view returns (uint256);

    /// @notice Weight a veNFT assigned to a specific pool.
    function votes(uint256 _tokenId, address _pool) external view returns (uint256);

    /// @notice Total weight a veNFT currently has deployed.
    function usedWeights(uint256 _tokenId) external view returns (uint256);

    /// @notice Total weight allocated to a pool across all voters.
    function weights(address _pool) external view returns (uint256);

    /// @notice Timestamp after which voting closes for the epoch containing `_timestamp`.
    function epochVoteEnd(uint256 _timestamp) external view returns (uint256);

    /// @notice Last epoch timestamp at which a veNFT voted.
    function lastVoted(uint256 _tokenId) external view returns (uint256);

    function isGauge(address _gauge) external view returns (bool);

    function isAlive(address _gauge) external view returns (bool);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Subset of Mezo's Router (Tigris, Aerodrome-style) interface used to convert
///         harvested reward tokens into MUSD.
/// @dev ABI taken from mezo-org/tigris `solidity/deployments/testnet/Router.json`.
///      Testnet: 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9
///      Mainnet: 0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706
interface IRouter {
    /// @dev A single hop. `stable` selects the stable-curve vs constant-product pool.
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, Route[] calldata routes)
        external
        view
        returns (uint256[] memory amounts);

    function defaultFactory() external view returns (address);

    function poolFor(address tokenA, address tokenB, bool stable, address _factory)
        external
        view
        returns (address pool);
}

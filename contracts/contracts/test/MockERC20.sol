// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY. Never deployed to a live network.
///
/// Used to stand in for Mezo's BTC facade (0x7b7C..0000) inside fork tests. That
/// facade is a Cosmos system contract whose balances are backed by bank-module
/// state hooks in `mezod`; EDR cannot reproduce those hooks, so calls to it revert
/// on a fork even though the bytecode is identical to mainnet.
///
/// We inject this contract's runtime code at that address and mint test balances.
/// It is a plain ERC-20, exactly what the facade presents to callers, so the
/// substitution is faithful for the paths under test. Every other Mezo contract --
/// VeBTC, VeBTCVoter, Router, the gauges -- is used as actually deployed.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @dev Unguarded on purpose: tests call this after `hardhat_setCode`, at which
    ///      point no constructor has run at the target address.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

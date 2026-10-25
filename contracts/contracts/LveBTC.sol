// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title lveBTC - liquid, perpetually-locked veBTC
/// @notice Receipt token for BTC deposited into Perpetua. One lveBTC is minted per
///         1 BTC added to the protocol's permanently-locked veBTC position.
/// @dev Minting is restricted to the locker, which is set once at construction and
///      can never change. There is no burn path: deposits into Perpetua are
///      irreversible, so lveBTC supply only grows. Holders exit by selling on the
///      secondary market, not by redeeming -- the same shape as Convex's cvxCRV.
contract LveBTC is ERC20, ERC20Permit {
    /// @notice The only address allowed to mint. Immutable by design.
    address public immutable locker;

    error OnlyLocker();
    error ZeroAddress();

    constructor(address _locker) ERC20("Perpetua Liquid veBTC", "lveBTC") ERC20Permit("Perpetua Liquid veBTC") {
        if (_locker == address(0)) revert ZeroAddress();
        locker = _locker;
    }

    /// @notice Mints `amount` to `to`. Callable only by the locker.
    function mint(address to, uint256 amount) external {
        if (msg.sender != locker) revert OnlyLocker();
        _mint(to, amount);
    }
}

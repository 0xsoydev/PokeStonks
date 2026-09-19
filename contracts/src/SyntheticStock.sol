// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SyntheticStock
/// @notice A game token ("sSTOCK") representing a Pokemon-style stock creature in PokeStonks.
/// @dev SYNTHETIC, TESTNET-ONLY TOKEN. It is NOT a real security, NOT backed by any share or
///      asset, carries NO claim on any issuer, and has NO monetary value. It exists purely as an
///      in-game reward on Monad testnet.
///
///      Supply is created only by a single `minter` (the BattleArena) which the owner may
///      assign exactly once; after that the owner has no remaining privileged capability over
///      the token. Holders can burn their own tokens (ERC20Burnable).
contract SyntheticStock is ERC20, ERC20Burnable, Ownable {
    /// @notice The only address allowed to mint. Zero until set; immutable once set.
    address public minter;

    /// @notice Emitted once when the minter is assigned.
    /// @param minter The address that may now mint.
    event MinterSet(address indexed minter);

    /// @notice Thrown when a zero address is supplied where a real address is required.
    error ZeroAddress();
    /// @notice Thrown when `setMinter` is called after the minter was already assigned.
    error MinterAlreadySet();
    /// @notice Thrown when a caller other than the minter tries to mint.
    /// @param caller The unauthorized caller.
    error NotMinter(address caller);

    /// @param name_ Token name, e.g. "Synthetic Tesla".
    /// @param symbol_ Token symbol, e.g. "sTSLA".
    /// @param owner_ Account allowed to call `setMinter` (once).
    constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {}

    /// @notice Assigns the sole minter. Callable by the owner exactly once; the assignment is permanent.
    /// @param minter_ The BattleArena (or other authorized) contract.
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        if (minter != address(0)) revert MinterAlreadySet();
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Mints `amount` tokens to `to`. Only callable by the minter.
    /// @param to Recipient.
    /// @param amount Amount in base units (18 decimals).
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        _mint(to, amount);
    }
}

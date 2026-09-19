// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ponytail: token IS the vault (1M self-minted); catch is free — caller pays gas only, receives dropAmount
// ponytail: no per-address limit, anyone can drain the vault; add a cooldown/allowlist when it matters
contract MockStock is ERC20 {
    uint256 public immutable dropAmount;

    constructor(string memory n, string memory s, uint256 drop_) ERC20(n, s) {
        dropAmount = drop_;
        _mint(address(this), 1_000_000e18);
    }

    function catchStock() external {
        _transfer(address(this), msg.sender, dropAmount);
    }
}

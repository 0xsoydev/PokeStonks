// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BattleArena} from "../../src/BattleArena.sol";

/// @dev Relayer whose ETH acceptance can be toggled, to exercise the deferred-refund path.
contract PickyRelayer {
    bool public accept;

    function setAccept(bool a) external {
        accept = a;
    }

    function relay(BattleArena arena, BattleArena.Claim calldata c, bytes calldata sig, bytes[] calldata upd)
        external
        payable
    {
        arena.claim{value: msg.value}(c, sig, upd);
    }

    function withdraw(BattleArena arena) external {
        arena.withdrawRefund();
    }

    receive() external payable {
        require(accept, "no eth");
    }
}

/// @dev Relayer that tries to re-enter `claim` (with a second voucher) from its refund callback.
contract ReenteringRelayer {
    BattleArena public arena;
    BattleArena.Claim internal c2;
    bytes internal sig2;
    bool public reentered;
    bool public reentryAttempted;

    function arm(BattleArena arena_, BattleArena.Claim calldata c2_, bytes calldata sig2_) external {
        arena = arena_;
        c2 = c2_;
        sig2 = sig2_;
    }

    function relay(BattleArena.Claim calldata c, bytes calldata sig, bytes[] calldata upd) external payable {
        arena.claim{value: msg.value}(c, sig, upd);
    }

    receive() external payable {
        reentryAttempted = true;
        bytes[] memory none = new bytes[](0);
        try arena.claim(c2, sig2, none) {
            reentered = true;
        } catch {}
    }
}

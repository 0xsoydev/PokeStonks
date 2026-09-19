// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SyntheticStock} from "../src/SyntheticStock.sol";

contract SyntheticStockTest is Test {
    SyntheticStock internal token;
    address internal owner = makeAddr("owner");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");

    event MinterSet(address indexed minter);

    function setUp() public {
        token = new SyntheticStock("Synthetic Tesla", "sTSLA", owner);
    }

    function test_metadata() public view {
        assertEq(token.name(), "Synthetic Tesla");
        assertEq(token.symbol(), "sTSLA");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), owner);
        assertEq(token.minter(), address(0));
        assertEq(token.totalSupply(), 0);
    }

    function test_setMinter_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.setMinter(minter);
    }

    function test_setMinter_once_thenLocked() public {
        vm.expectEmit(true, false, false, false, address(token));
        emit MinterSet(minter);
        vm.prank(owner);
        token.setMinter(minter);
        assertEq(token.minter(), minter);

        vm.prank(owner);
        vm.expectRevert(SyntheticStock.MinterAlreadySet.selector);
        token.setMinter(alice);
        assertEq(token.minter(), minter);
    }

    function test_setMinter_zero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(SyntheticStock.ZeroAddress.selector);
        token.setMinter(address(0));
    }

    function test_setMinter_ownerCannotResetEvenAfterOwnershipTransfer() public {
        vm.prank(owner);
        token.setMinter(minter);
        vm.prank(owner);
        token.transferOwnership(alice);
        vm.prank(alice);
        vm.expectRevert(SyntheticStock.MinterAlreadySet.selector);
        token.setMinter(alice);
    }

    function test_mint_onlyMinter() public {
        vm.prank(owner);
        token.setMinter(minter);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SyntheticStock.NotMinter.selector, owner));
        token.mint(alice, 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(SyntheticStock.NotMinter.selector, stranger));
        token.mint(alice, 1);

        vm.prank(minter);
        token.mint(alice, 5e18);
        assertEq(token.balanceOf(alice), 5e18);
    }

    function test_mint_beforeMinterSet_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(SyntheticStock.NotMinter.selector, address(this)));
        token.mint(alice, 1);
    }

    function test_burn_selfAndAllowance() public {
        vm.prank(owner);
        token.setMinter(minter);
        vm.prank(minter);
        token.mint(alice, 10e18);

        vm.prank(alice);
        token.burn(4e18);
        assertEq(token.balanceOf(alice), 6e18);
        assertEq(token.totalSupply(), 6e18);

        vm.prank(alice);
        token.approve(stranger, 2e18);
        vm.prank(stranger);
        token.burnFrom(alice, 2e18);
        assertEq(token.balanceOf(alice), 4e18);
    }

    function testFuzz_mint_increasesSupply(address to, uint128 amount) public {
        vm.assume(to != address(0));
        vm.prank(owner);
        token.setMinter(minter);
        vm.prank(minter);
        token.mint(to, amount);
        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), amount);
    }
}

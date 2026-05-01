// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { MUSDC } from "../src/MUSDC.sol";

contract MUSDCTest is Test {
    MUSDC internal mUSDC;
    address internal alice = address(0xA11CE);

    function setUp() public {
        mUSDC = new MUSDC();
    }

    function testDecimalsIs6() public view {
        assertEq(mUSDC.decimals(), 6);
    }

    function testSymbolIsMUSDC() public view {
        assertEq(mUSDC.symbol(), "mUSDC");
    }

    function testMintToAnyone() public {
        mUSDC.mint(alice, 1_000_000); // 1 mUSDC
        assertEq(mUSDC.balanceOf(alice), 1_000_000);
    }

    function testFuzzMintAmount(uint128 amount) public {
        mUSDC.mint(alice, amount);
        assertEq(mUSDC.balanceOf(alice), amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { MUSDC } from "../src/MUSDC.sol";
import { ClawforgerINFT } from "../src/ClawforgerINFT.sol";
import { SkillRegistry } from "../src/SkillRegistry.sol";
import { RoyaltyVault } from "../src/RoyaltyVault.sol";

contract RoyaltyVaultTest is Test {
    MUSDC internal mUSDC;
    ClawforgerINFT internal inft;
    SkillRegistry internal registry;
    RoyaltyVault internal vault;

    address internal owner = address(0xC0FFEE);
    address internal payer = address(0xFADE);
    address internal treasury = address(0x7E45);
    address internal settler = address(0x5E11);
    address internal newOwner = address(0xC0DE);

    bytes32 internal constant ARTIFACT = bytes32(uint256(0xABC));
    bytes32 internal constant INTEL = bytes32(uint256(0xDEAD));
    bytes32 internal constant MANIFEST = bytes32(uint256(0xBEEF));

    function setUp() public {
        mUSDC = new MUSDC();

        // Predict iNFT address (next deployed contract after this one) so the
        // registry can be deployed with it baked in, matching Deploy.s.sol.
        address predictedINFT = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        registry = new SkillRegistry(predictedINFT, address(this));
        inft = new ClawforgerINFT(address(mUSDC), address(registry), treasury, settler);
        require(address(inft) == predictedINFT, "predicted-mismatch");

        // Mint an agent so a vault is created
        uint256 tokenId = inft.mintAgent(owner, INTEL, MANIFEST);
        ( , , , address vaultAddr, ) = inft.agents(tokenId);
        vault = RoyaltyVault(vaultAddr);

        // Wire the registry's trusted recorder to the vault so settle() can call recordUse()
        vm.prank(address(inft));
        registry.setTrustedRecorder(address(vault));

        // Publish the skill so recordUse has something to record
        vm.prank(owner);
        registry.publishSkill(ARTIFACT, tokenId, "fetch.arxiv", 100e6);

        // Fund payer with mUSDC + approve the vault
        mUSDC.mint(payer, 100e6);
        vm.prank(payer);
        mUSDC.approve(address(vault), type(uint256).max);
    }

    function testSettleSplits5_95() public {
        uint256 amount = 100e6; // 100 mUSDC

        vm.prank(settler);
        vault.settle(ARTIFACT, amount, payer);

        // 95% to owner, 5% to treasury
        assertEq(mUSDC.balanceOf(owner), 95e6, "owner share wrong");
        assertEq(mUSDC.balanceOf(treasury), 5e6, "protocol share wrong");
        assertEq(mUSDC.balanceOf(payer), 0, "payer should be drained");
    }

    function testSettleEmitsEvents() public {
        vm.prank(settler);
        vm.expectEmit(true, true, false, true);
        emit RoyaltyVault.RoyaltyReceived(ARTIFACT, 10e6, payer);
        vault.settle(ARTIFACT, 10e6, payer);
    }

    function testSettleOnlyTrustedSettler() public {
        vm.expectRevert(RoyaltyVault.NotTrustedSettler.selector);
        vault.settle(ARTIFACT, 10e6, payer);
    }

    function testSettleZeroAmountReverts() public {
        vm.prank(settler);
        vm.expectRevert(RoyaltyVault.ZeroAmount.selector);
        vault.settle(ARTIFACT, 0, payer);
    }

    function testSettleForwardsToCurrentOwner() public {
        // Transfer iNFT to newOwner
        vm.prank(owner);
        inft.transferWithReencryption(1, newOwner, bytes32(uint256(0xCAFE)));

        vm.prank(settler);
        vault.settle(ARTIFACT, 100e6, payer);

        // 95% should now go to newOwner, not original owner
        assertEq(mUSDC.balanceOf(newOwner), 95e6, "newOwner did not receive royalty");
        assertEq(mUSDC.balanceOf(owner), 0, "original owner should not receive");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { MUSDC } from "../src/MUSDC.sol";
import { ClawforgerINFT } from "../src/ClawforgerINFT.sol";
import { SkillRegistry } from "../src/SkillRegistry.sol";

contract SkillRegistryTest is Test {
    MUSDC internal mUSDC;
    ClawforgerINFT internal inft;
    SkillRegistry internal registry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal recorder = address(0xDEAD);

    function setUp() public {
        mUSDC = new MUSDC();
        address predictedINFT = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        registry = new SkillRegistry(predictedINFT);
        inft = new ClawforgerINFT(address(mUSDC), address(registry), address(0x7E45), address(0x5E11));
        require(address(inft) == predictedINFT, "predicted-mismatch");

        // The iNFT is the deployer; only it can set trustedRecorder
        vm.prank(address(inft));
        registry.setTrustedRecorder(recorder);
    }

    function _mintAgent(address to) internal returns (uint256 tokenId) {
        tokenId = inft.mintAgent(to, bytes32(uint256(1)), bytes32(uint256(2)));
    }

    function testPublishOnlyOwner() public {
        uint256 tokenId = _mintAgent(alice);
        vm.prank(alice);
        registry.publishSkill(bytes32(uint256(0xABC)), tokenId, "fetch.arxiv", 50000);
        SkillRegistry.Skill memory s = registry.getSkill(bytes32(uint256(0xABC)));
        assertEq(s.priceUSDC, 50000);
        assertEq(s.capabilityTag, "fetch.arxiv");
    }

    function testPublishNonOwnerReverts() public {
        uint256 tokenId = _mintAgent(alice);
        vm.prank(bob);
        vm.expectRevert(SkillRegistry.NotINFTOwner.selector);
        registry.publishSkill(bytes32(uint256(0xABC)), tokenId, "fetch.arxiv", 50000);
    }

    function testPublishDuplicateReverts() public {
        uint256 tokenId = _mintAgent(alice);
        vm.startPrank(alice);
        registry.publishSkill(bytes32(uint256(0xABC)), tokenId, "fetch.arxiv", 50000);
        vm.expectRevert(SkillRegistry.AlreadyPublished.selector);
        registry.publishSkill(bytes32(uint256(0xABC)), tokenId, "fetch.arxiv", 50000);
        vm.stopPrank();
    }

    function testFindByTagReturnsAll() public {
        uint256 tokenId = _mintAgent(alice);
        vm.startPrank(alice);
        registry.publishSkill(bytes32(uint256(0xA)), tokenId, "fetch.arxiv", 50000);
        registry.publishSkill(bytes32(uint256(0xB)), tokenId, "fetch.arxiv", 60000);
        registry.publishSkill(bytes32(uint256(0xC)), tokenId, "math.add", 10000);
        vm.stopPrank();

        bytes32[] memory found = registry.findByTag("fetch.arxiv");
        assertEq(found.length, 2);
        assertEq(found[0], bytes32(uint256(0xA)));
        assertEq(found[1], bytes32(uint256(0xB)));
    }

    function testRecordUseIsPermissionless() public {
        uint256 tokenId = _mintAgent(alice);
        vm.prank(alice);
        registry.publishSkill(bytes32(uint256(0xA)), tokenId, "fetch.arxiv", 50000);

        // Anyone can call recordUse (only increments a counter)
        vm.prank(bob);
        registry.recordUse(bytes32(uint256(0xA)));

        SkillRegistry.Skill memory s = registry.getSkill(bytes32(uint256(0xA)));
        assertEq(s.useCount, 1);
    }

    function testRecordUseUnknownReverts() public {
        vm.prank(recorder);
        vm.expectRevert(SkillRegistry.UnknownSkill.selector);
        registry.recordUse(bytes32(uint256(0xDEADBEEF)));
    }

    function testTotalSkills() public {
        uint256 tokenId = _mintAgent(alice);
        vm.startPrank(alice);
        registry.publishSkill(bytes32(uint256(0xA)), tokenId, "tag1", 1000);
        registry.publishSkill(bytes32(uint256(0xB)), tokenId, "tag2", 1000);
        vm.stopPrank();
        assertEq(registry.totalSkills(), 2);
    }
}

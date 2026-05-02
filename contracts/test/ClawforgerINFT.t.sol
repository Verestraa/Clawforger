// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { MUSDC } from "../src/MUSDC.sol";
import { ClawforgerINFT } from "../src/ClawforgerINFT.sol";
import { SkillRegistry } from "../src/SkillRegistry.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";

contract ClawforgerINFTTest is Test {
    MUSDC internal mUSDC;
    ClawforgerINFT internal inft;
    SkillRegistry internal registry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal treasury = address(0x7E45);
    address internal settler = address(0x5E11);

    bytes32 internal constant INTEL = bytes32(uint256(0xDEAD));
    bytes32 internal constant MANIFEST = bytes32(uint256(0xBEEF));
    bytes32 internal constant NEW_MANIFEST = bytes32(uint256(0xFEED));
    bytes32 internal constant NEW_MEM_ROOT = bytes32(uint256(0xCAFE));

    function setUp() public {
        mUSDC = new MUSDC();
        address predictedINFT = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        registry = new SkillRegistry(predictedINFT, address(this));
        inft = new ClawforgerINFT(address(mUSDC), address(registry), treasury, settler);
        require(address(inft) == predictedINFT, "predicted-mismatch");
    }

    function testMintAgent() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);
        assertEq(tokenId, 1);
        assertEq(inft.ownerOf(tokenId), alice);

        (bytes32 intel, bytes32 mani, , address vault, ) = inft.agents(tokenId);
        assertEq(intel, INTEL);
        assertEq(mani, MANIFEST);
        assertTrue(vault != address(0), "vault not deployed");
    }

    function testMintEmptyHashReverts() public {
        vm.expectRevert(ClawforgerINFT.EmptyHash.selector);
        inft.mintAgent(alice, bytes32(0), MANIFEST);
    }

    function testEvolveAgentByOwner() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);

        vm.prank(alice);
        inft.evolveAgent(tokenId, NEW_MANIFEST, NEW_MEM_ROOT);

        ( , bytes32 mani, bytes32 mem, , uint256 evolvedAt) = inft.agents(tokenId);
        assertEq(mani, NEW_MANIFEST);
        assertEq(mem, NEW_MEM_ROOT);
        assertGt(evolvedAt, 0);
    }

    function testEvolveOnlyTokenOwner() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);
        vm.prank(bob);
        vm.expectRevert(ClawforgerINFT.NotTokenOwner.selector);
        inft.evolveAgent(tokenId, NEW_MANIFEST, NEW_MEM_ROOT);
    }

    function testEvolveEmitsMetadataUpdate() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit IERC4906.MetadataUpdate(tokenId);
        inft.evolveAgent(tokenId, NEW_MANIFEST, NEW_MEM_ROOT);
    }

    function testTransferWithReencryption() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);

        bytes32 newIntel = bytes32(uint256(0xABCDEF));
        vm.prank(alice);
        inft.transferWithReencryption(tokenId, bob, newIntel);

        assertEq(inft.ownerOf(tokenId), bob);
        (bytes32 intel, , , , ) = inft.agents(tokenId);
        assertEq(intel, newIntel);
    }

    function testTransferEmptyHashReverts() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);
        vm.prank(alice);
        vm.expectRevert(ClawforgerINFT.EmptyHash.selector);
        inft.transferWithReencryption(tokenId, bob, bytes32(0));
    }

    function testTokenURIReflectsLatestEvolution() public {
        uint256 tokenId = inft.mintAgent(alice, INTEL, MANIFEST);
        string memory uriBefore = inft.tokenURI(tokenId);

        vm.prank(alice);
        inft.evolveAgent(tokenId, NEW_MANIFEST, NEW_MEM_ROOT);
        string memory uriAfter = inft.tokenURI(tokenId);

        assertTrue(keccak256(bytes(uriBefore)) != keccak256(bytes(uriAfter)));
    }

    function testSupportsERC4906() public view {
        assertTrue(inft.supportsInterface(bytes4(0x49064906)));
    }
}

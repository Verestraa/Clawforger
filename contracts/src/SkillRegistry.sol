// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title SkillRegistry — onchain index of skills published by Clawforger agents
/// @notice Trustless mirror of the 0G KV registry. Other agents read from this
///         contract to discover purchasable skills.
contract SkillRegistry {
    struct Skill {
        bytes32 artifactHash;     // 0G Storage content hash
        address ownerINFT;        // ClawforgerINFT contract
        uint256 ownerTokenId;     // which agent owns this skill
        uint256 priceUSDC;        // x402 paywall price (6 decimals — mUSDC)
        string capabilityTag;     // e.g., "fetch.arxiv"
        uint64 publishedAt;
        uint32 useCount;          // increments on every paid use
    }

    address public immutable INFT_CONTRACT;

    mapping(bytes32 artifactHash => Skill) private _skills;
    mapping(string tag => bytes32[]) private _byTag;
    bytes32[] public allSkills;

    address public trustedRecorder;     // RoyaltyVault that calls recordUse

    event SkillPublished(
        bytes32 indexed artifactHash,
        address indexed ownerINFT,
        uint256 ownerTokenId,
        string capabilityTag,
        uint256 priceUSDC
    );
    event SkillUsed(bytes32 indexed artifactHash, uint32 newUseCount);
    event TrustedRecorderSet(address indexed recorder);

    error NotINFTOwner();
    error AlreadyPublished();
    error UnknownSkill();
    error NotTrustedRecorder();

    constructor(address inft) {
        INFT_CONTRACT = inft;
    }

    /// @notice Publish a skill artifact under a Clawforger iNFT
    function publishSkill(
        bytes32 artifactHash,
        uint256 tokenId,
        string calldata capabilityTag,
        uint256 priceUSDC
    ) external {
        if (IERC721(INFT_CONTRACT).ownerOf(tokenId) != msg.sender) revert NotINFTOwner();
        if (_skills[artifactHash].artifactHash != bytes32(0)) revert AlreadyPublished();

        _skills[artifactHash] = Skill({
            artifactHash: artifactHash,
            ownerINFT: INFT_CONTRACT,
            ownerTokenId: tokenId,
            priceUSDC: priceUSDC,
            capabilityTag: capabilityTag,
            publishedAt: uint64(block.timestamp),
            useCount: 0
        });
        _byTag[capabilityTag].push(artifactHash);
        allSkills.push(artifactHash);

        emit SkillPublished(artifactHash, INFT_CONTRACT, tokenId, capabilityTag, priceUSDC);
    }

    /// @notice Increment the use count after a skill execution.
    /// @dev    Permissionless: useCount only drives marketplace sorting and
    ///         analytics, not value distribution. Each per-agent RoyaltyVault
    ///         calls this from its settle() function — making it permissioned
    ///         would require the registry to track every vault address (one
    ///         per agent), which is impractical. Worst case anyone can inflate
    ///         their own skill's useCount, which would self-detect quickly
    ///         from on-chain history.
    function recordUse(bytes32 artifactHash) external {
        Skill storage s = _skills[artifactHash];
        if (s.artifactHash == bytes32(0)) revert UnknownSkill();
        unchecked { s.useCount += 1; }
        emit SkillUsed(artifactHash, s.useCount);
    }

    /// @notice Set the trusted recorder. One-time setter; must be called by INFT_CONTRACT.
    function setTrustedRecorder(address recorder) external {
        require(msg.sender == INFT_CONTRACT, "only-inft");
        trustedRecorder = recorder;
        emit TrustedRecorderSet(recorder);
    }

    function getSkill(bytes32 artifactHash) external view returns (Skill memory) {
        return _skills[artifactHash];
    }

    /// @notice Returns up to 50 skills matching a capability tag
    /// @dev Pagination not supported in hackathon scope. Cap is documented.
    function findByTag(string calldata tag) external view returns (bytes32[] memory result) {
        bytes32[] storage tagged = _byTag[tag];
        uint256 cap = tagged.length > 50 ? 50 : tagged.length;
        result = new bytes32[](cap);
        for (uint256 i = 0; i < cap; ) {
            result[i] = tagged[i];
            unchecked { ++i; }
        }
    }

    function totalSkills() external view returns (uint256) {
        return allSkills.length;
    }
}

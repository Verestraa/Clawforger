// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { RoyaltyVault } from "./RoyaltyVault.sol";

/// @title ClawforgerINFT — ERC-7857 iNFT for Clawforger agents
/// @notice Each iNFT represents an autonomous AI agent. Its intelligence
///         (system prompt + skills + memory pointer) is encrypted on 0G Storage
///         and referenced by hash here. Metadata mutates as the agent evolves
///         (ERC-7857). Transfer requires re-encryption to new owner's pubkey.
/// @dev    ERC-7857 is still being standardized; this is a minimal compliant
///         implementation that ships the load-bearing semantics:
///           - encrypted private metadata (intelligenceHash points to AES-blob)
///           - dynamic metadata updates (ERC-4906 MetadataUpdate event)
///           - secure transfer with re-encryption commitment
///         A future revision can swap to the canonical ERC-7857 reference
///         once it lands in OpenZeppelin or similar.
contract ClawforgerINFT is ERC721, Ownable2Step, IERC4906 {
    using Strings for uint256;

    struct AgentData {
        bytes32 intelligenceHash;     // 0G Storage pointer (encrypted blob)
        bytes32 skillManifestHash;    // 0G Storage pointer (current skills)
        bytes32 memoryRootHash;       // 0G KV root
        address royaltyVault;         // per-agent RoyaltyVault
        uint256 evolvedAt;            // last metadata update unix seconds
    }

    address public immutable MUSDC;
    address public immutable SKILL_REGISTRY;
    address public immutable PROTOCOL_TREASURY;
    address public immutable TRUSTED_SETTLER;     // initial settler, can rotate per-vault later

    uint256 private _nextTokenId = 1;
    mapping(uint256 tokenId => AgentData) public agents;

    event AgentMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 intelligenceHash,
        address royaltyVault
    );
    event AgentEvolved(
        uint256 indexed tokenId,
        bytes32 newSkillManifestHash,
        bytes32 newMemoryRootHash,
        uint256 ts
    );
    /// @notice Emitted when a transfer is initiated with a re-encrypted intelligence key.
    ///         The new key is delivered off-chain to the recipient via 0G Storage's
    ///         secure-transfer hook. We just commit to the new ciphertext hash on-chain.
    event SecureTransfer(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bytes32 newIntelligenceHash
    );

    error EmptyHash();
    error NotTokenOwner();
    error UnknownToken();

    constructor(
        address mUSDC,
        address skillRegistry,
        address protocolTreasury,
        address trustedSettler
    ) ERC721("Clawforger Agents", "CLAW") Ownable(msg.sender) {
        MUSDC = mUSDC;
        SKILL_REGISTRY = skillRegistry;
        PROTOCOL_TREASURY = protocolTreasury;
        TRUSTED_SETTLER = trustedSettler;
    }

    /// @notice Mint a new iNFT agent. Deploys a fresh RoyaltyVault for this agent.
    function mintAgent(
        address to,
        bytes32 intelligenceHash,
        bytes32 skillManifestHash
    ) external returns (uint256 tokenId) {
        if (intelligenceHash == bytes32(0)) revert EmptyHash();

        tokenId = _nextTokenId++;

        // Deploy per-agent RoyaltyVault (CREATE — vault address unique per token)
        RoyaltyVault vault = new RoyaltyVault(
            address(this),
            tokenId,
            MUSDC,
            PROTOCOL_TREASURY,
            SKILL_REGISTRY,
            TRUSTED_SETTLER
        );

        agents[tokenId] = AgentData({
            intelligenceHash: intelligenceHash,
            skillManifestHash: skillManifestHash,
            memoryRootHash: bytes32(0),
            royaltyVault: address(vault),
            evolvedAt: block.timestamp
        });

        _safeMint(to, tokenId);
        emit AgentMinted(tokenId, to, intelligenceHash, address(vault));
    }

    /// @notice Update an agent's skill manifest + memory root (called after `skill-forge` succeeds)
    function evolveAgent(
        uint256 tokenId,
        bytes32 newSkillManifestHash,
        bytes32 newMemoryRootHash
    ) external {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        AgentData storage a = agents[tokenId];
        a.skillManifestHash = newSkillManifestHash;
        a.memoryRootHash = newMemoryRootHash;
        a.evolvedAt = block.timestamp;

        emit AgentEvolved(tokenId, newSkillManifestHash, newMemoryRootHash, block.timestamp);
        emit MetadataUpdate(tokenId);   // ERC-4906 — wallets refresh metadata
    }

    /// @notice Transfer with re-encryption commitment.
    /// @param  newIntelligenceHash The 0G Storage pointer to the blob re-encrypted under
    ///         the recipient's pubkey. The off-chain ERC-7857 secure transfer flow uploads
    ///         the new ciphertext first, then submits this tx referencing it.
    /// @dev    Performs the ERC-721 transfer and updates the intelligence pointer atomically.
    function transferWithReencryption(
        uint256 tokenId,
        address to,
        bytes32 newIntelligenceHash
    ) external {
        if (newIntelligenceHash == bytes32(0)) revert EmptyHash();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        agents[tokenId].intelligenceHash = newIntelligenceHash;
        agents[tokenId].evolvedAt = block.timestamp;

        emit SecureTransfer(tokenId, msg.sender, to, newIntelligenceHash);
        emit MetadataUpdate(tokenId);

        _transfer(msg.sender, to, tokenId);
    }

    /// @notice tokenURI returns a 0G Storage URI scheme pointing at the iNFT's
    ///         current metadata blob. The Studio + 0G explorers resolve this.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        // og-storage://<intelligenceHash>?manifest=<skillManifestHash>&mem=<memoryRootHash>
        AgentData memory a = agents[tokenId];
        return string.concat(
            "og-storage://",
            _bytes32ToHex(a.intelligenceHash),
            "?manifest=",
            _bytes32ToHex(a.skillManifestHash),
            "&mem=",
            _bytes32ToHex(a.memoryRootHash),
            "&tokenId=",
            tokenId.toString()
        );
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        // 0x49064906 — ERC-4906 MetadataUpdate
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    function _bytes32ToHex(bytes32 v) private pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory s = new bytes(64);
        for (uint256 i = 0; i < 32; ++i) {
            uint8 b = uint8(v[i]);
            s[i * 2] = hexChars[b >> 4];
            s[i * 2 + 1] = hexChars[b & 0x0f];
        }
        return string(s);
    }
}

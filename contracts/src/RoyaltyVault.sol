// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISkillRegistry {
    function recordUse(bytes32 artifactHash) external;
}

/// @title RoyaltyVault — per-iNFT mUSDC royalty splitter
/// @notice Receives mUSDC from x402 settlement and splits 5% protocol / 95% iNFT owner.
///         One vault per Clawforger iNFT, deployed at mint time via CREATE2.
contract RoyaltyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable INFT;
    uint256 public immutable TOKEN_ID;
    address public immutable MUSDC;
    address public immutable PROTOCOL_TREASURY;
    address public immutable SKILL_REGISTRY;

    uint16 public constant PROTOCOL_BPS = 500;   // 5%
    uint16 public constant OWNER_BPS = 9500;     // 95%
    uint16 public constant TOTAL_BPS = 10_000;

    address public trustedSettler;               // x402 facilitator / KeeperHub workflow runner

    event RoyaltyReceived(bytes32 indexed artifactHash, uint256 amount, address indexed payer);
    event RoyaltyDistributed(uint256 toOwner, uint256 toProtocol, address indexed currentOwner);
    event TrustedSettlerSet(address indexed settler);

    error NotTrustedSettler();
    error ZeroAmount();
    error TransferFailed();

    constructor(
        address inft,
        uint256 tokenId,
        address mUSDC,
        address treasury,
        address registry,
        address settler
    ) {
        INFT = inft;
        TOKEN_ID = tokenId;
        MUSDC = mUSDC;
        PROTOCOL_TREASURY = treasury;
        SKILL_REGISTRY = registry;
        trustedSettler = settler;
    }

    modifier onlyTrustedSettler() {
        if (msg.sender != trustedSettler) revert NotTrustedSettler();
        _;
    }

    /// @notice Settles a paid skill use. The payer must have approved this vault
    ///         to pull `amount` of mUSDC.
    /// @dev Splits to current iNFT owner (read live, so resale doesn't strand royalties)
    ///      and protocol treasury. Records use on the SkillRegistry.
    function settle(bytes32 artifactHash, uint256 amount, address payer) external nonReentrant onlyTrustedSettler {
        if (amount == 0) revert ZeroAmount();

        IERC20(MUSDC).safeTransferFrom(payer, address(this), amount);
        emit RoyaltyReceived(artifactHash, amount, payer);

        uint256 toProtocol = (amount * PROTOCOL_BPS) / TOTAL_BPS;
        uint256 toOwner = amount - toProtocol;

        address currentOwner = IERC721(INFT).ownerOf(TOKEN_ID);
        IERC20(MUSDC).safeTransfer(currentOwner, toOwner);
        IERC20(MUSDC).safeTransfer(PROTOCOL_TREASURY, toProtocol);

        emit RoyaltyDistributed(toOwner, toProtocol, currentOwner);

        // Best-effort: skip-on-revert is fine, but registry should be reliable
        ISkillRegistry(SKILL_REGISTRY).recordUse(artifactHash);
    }

    /// @notice Owner of the contract (iNFT contract itself) can update the trusted settler
    function setTrustedSettler(address newSettler) external {
        // Only the iNFT contract (deployer) can rotate the settler
        require(msg.sender == INFT, "only-inft");
        trustedSettler = newSettler;
        emit TrustedSettlerSet(newSettler);
    }
}

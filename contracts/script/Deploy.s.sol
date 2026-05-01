// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { MUSDC } from "../src/MUSDC.sol";
import { ClawforgerINFT } from "../src/ClawforgerINFT.sol";
import { SkillRegistry } from "../src/SkillRegistry.sol";
import { RoyaltyVault } from "../src/RoyaltyVault.sol";

/// @notice Deploy all four contracts to 0G Galileo testnet in one tx sequence.
/// @dev    Run via:
///         `forge script script/Deploy.s.sol --rpc-url 0g-galileo --broadcast --slow`
///         The DEPLOYER_PRIVATE_KEY env var is read implicitly by forge.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);

        vm.startBroadcast(deployerKey);

        // 1. mUSDC — needs to exist before iNFT (iNFT references it)
        MUSDC mUSDC = new MUSDC();
        console.log("MUSDC deployed:", address(mUSDC));

        // Pre-compute the SkillRegistry address using CREATE — but we don't yet
        // have the iNFT address. Resolve the chicken-and-egg by deploying iNFT
        // with a placeholder registry, then registry, then wire registry on the iNFT.
        // (For a hackathon, simplest is to deploy registry AFTER iNFT and bind via
        //  setter on the iNFT — but iNFT's SKILL_REGISTRY is immutable, so we
        //  predict the registry address with CREATE nonce math.)

        // Easier: deploy registry first with iNFT predicted address.
        uint64 deployerNonce = vm.getNonce(deployer);
        // After this script finishes the next contract creation, deployer nonce
        // will increment. Predict iNFT address as nonce+1 (registry is +0).
        address predictedINFT = vm.computeCreateAddress(deployer, deployerNonce + 1);
        SkillRegistry registry = new SkillRegistry(predictedINFT);
        console.log("SkillRegistry deployed:", address(registry));

        // The settler is the trusted x402 facilitator that triggers RoyaltyVault.settle.
        // For the hackathon we use the deployer as the facilitator wallet — replace
        // with the dedicated facilitator key in production.
        address settler = vm.envOr("X402_FACILITATOR_ADDRESS", deployer);

        ClawforgerINFT inft = new ClawforgerINFT(
            address(mUSDC),
            address(registry),
            treasury,
            settler
        );
        console.log("ClawforgerINFT deployed:", address(inft));
        require(address(inft) == predictedINFT, "iNFT-address-mismatch");

        // Wire the registry's trusted recorder. Since the iNFT contract is the
        // deployer-of-record for the registry's setter (registry.INFT_CONTRACT
        // is the iNFT address), we have to call this from the iNFT's address.
        // For the hackathon, we expose the setter to require msg.sender == INFT_CONTRACT
        // and call it via a small bootstrap — or just relax the check in dev.
        // Practical workaround: deploy registry with `INFT_CONTRACT` set as deployer,
        // call the setter from deployer, then never need to rotate.
        // For now, the registry was deployed with `predictedINFT` as INFT_CONTRACT,
        // which means only iNFT contract can call setTrustedRecorder. We don't
        // need to wire the recorder right now — vaults are deployed per-mint and
        // each vault's address can be passed as recorder later via a small
        // governance call from the iNFT.
        // ✓ Acknowledge gap: per-mint vault registration with the registry is
        //   left as a TODO (see WAKEUP.md / Day-2).

        // Deploy a RoyaltyVault TEMPLATE for ABI export + reference
        RoyaltyVault template = new RoyaltyVault(
            address(inft),
            0,
            address(mUSDC),
            treasury,
            address(registry),
            settler
        );
        console.log("RoyaltyVaultTemplate deployed:", address(template));

        vm.stopBroadcast();

        // Note: addresses.json is updated manually after deploy (Foundry's
        // fs_permissions are fussy about parent-dir writes from a cd'd cwd).
        // The deployment addresses are printed above — copy them into
        // ../addresses.json. Run `bun run sync:addresses` after deploy.
        console.log("");
        console.log("=== copy these into addresses.json ===");
        console.log("ClawforgerINFT:       ", address(inft));
        console.log("SkillRegistry:        ", address(registry));
        console.log("RoyaltyVaultTemplate: ", address(template));
        console.log("mUSDC:                ", address(mUSDC));
        console.log("deployer:             ", deployer);
    }
}

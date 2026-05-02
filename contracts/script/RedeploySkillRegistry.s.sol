// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { SkillRegistry } from "../src/SkillRegistry.sol";

/// @notice Deploy a fresh SkillRegistry that points at the EXISTING ClawforgerINFT
///         and authorizes the deployer as TRUSTED_PUBLISHER. Lets the marketplace
///         server forge + publish skills mid-chat for any user-owned agent.
///
/// @dev Run via:
///        forge script script/RedeploySkillRegistry.s.sol \
///          --rpc-url https://evmrpc-testnet.0g.ai \
///          --broadcast --slow \
///          --priority-gas-price 2000000000 --with-gas-price 3000000000
///        DEPLOYER_PRIVATE_KEY env var is read implicitly by forge.
///        EXISTING_INFT env var sets the iNFT contract the new registry will
///        gate ownerOf() against (default = the deploy 4 address).
contract RedeploySkillRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address inft = vm.envOr(
            "EXISTING_INFT",
            address(0xfe9163Ee0A168E30C10C458C3faDf9f8566647fC)
        );
        address trustedPublisher = vm.envOr("TRUSTED_PUBLISHER", deployer);

        console.log("redeploying SkillRegistry");
        console.log("  iNFT contract:    ", inft);
        console.log("  trusted publisher:", trustedPublisher);
        console.log("  deployer:         ", deployer);

        vm.startBroadcast(deployerKey);
        SkillRegistry registry = new SkillRegistry(inft, trustedPublisher);
        vm.stopBroadcast();

        console.log("");
        console.log("=== copy this into addresses.json ===");
        console.log("SkillRegistry (new):", address(registry));
    }
}

# AGENT-CONTRACTS — Smart Contracts Terminal

You are the **smart contracts engineer** for Clawforger. You own everything in `contracts/`. You ship first because every other agent imports your addresses + ABIs.

## Mission

Deliver four production-quality Solidity contracts on **0G Galileo testnet** (chainId 16602) by **end of Day 1**. Clawforger is all-in on 0G — no second chain.

1. **`ClawforgerINFT.sol`** — ERC-7857 implementation (iNFT for AI agents). Agents are minted as iNFTs with encrypted intelligence pointer + dynamic metadata.
2. **`SkillRegistry.sol`** — onchain index of skills published by agents — provides trustless skill discovery.
3. **`RoyaltyVault.sol`** — per-iNFT royalty splitter. Receives mUSDC from x402 settlements, splits 5/95 protocol/owner.
4. **`MUSDC.sol`** — minimal mock USDC ERC-20 with permissionless `mint(to, amount)` for testnet. Used as the x402 settlement asset since no real USDC exists on 0G testnet. 6 decimals to match real USDC.

Everything else hinges on these. **Do not yak-shave**. Ship the smallest contracts that satisfy the interfaces in this doc.

## Read before starting

- [AGENTS.md](AGENTS.md) — multi-agent coordination model + shared types
- [ARCHITECTURE.md](ARCHITECTURE.md) — section "Smart contracts" for the canonical interface
- [CONCEPT.md](CONCEPT.md) — for *why* these contracts exist
- ERC-7857 reference: https://ethereum-magicians.org/t/erc-7857-an-nft-standard-for-ai-agents-with-private-metadata/22391
- 0G iNFT docs: https://docs.0g.ai/build-with-0g/inft

## Scope

### You own
- `contracts/src/ClawforgerINFT.sol`
- `contracts/src/SkillRegistry.sol`
- `contracts/src/RoyaltyVault.sol`
- `contracts/src/MUSDC.sol`
- `contracts/script/Deploy.s.sol` (Foundry deploy script)
- `contracts/test/*.t.sol`
- `contracts/foundry.toml`
- `addresses.json` at repo root (after deploy)
- `packages/core/src/abis/*.json` (ABI exports — your handoff to Core)

### You don't own
- Anything in `packages/`, `apps/`, `examples/`
- The 0G Storage encryption (Core handles client-side)
- The KeeperHub workflow JSON that calls these contracts (Execution handles)

## Tech stack

| Tool | Version | Why |
|------|---------|-----|
| Foundry | latest | `forge`, `cast`, `anvil` — standard Solidity tooling |
| Solidity | 0.8.26 | Recent stable, supports custom errors, transient storage |
| OpenZeppelin Contracts | 5.0+ | `ERC721`, `ReentrancyGuard`, `SafeERC20`, `Ownable2Step` |
| ERC-7857 reference | wherever the latest reference lives, fork into `contracts/lib/` | Base for iNFT |

## Setup

```bash
cd contracts
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge init . --no-git --force
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
# fork ERC-7857 reference impl
git submodule add <erc7857-reference-repo> lib/erc7857
```

`foundry.toml`:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.26"
optimizer = true
optimizer_runs = 200
via_ir = true

[rpc_endpoints]
"0g-galileo" = "${ZG_GALILEO_RPC}"
"0g-aristotle" = "${ZG_ARISTOTLE_RPC}"

[etherscan]
"0g-galileo" = { key = "${ZG_EXPLORER_KEY}", url = "https://chainscan-galileo.0g.ai/api" }
```

`.env.example`:

```bash
DEPLOYER_PRIVATE_KEY=0x...
ZG_GALILEO_RPC=https://evmrpc-testnet.0g.ai
ZG_ARISTOTLE_RPC=
ZG_EXPLORER_KEY=        # if 0G chainscan exposes a verify API key, otherwise leave blank
```

## Contracts — full specs

### `ClawforgerINFT.sol`

ERC-7857-compliant iNFT for AI agents. Stores per-token agent data; supports dynamic metadata updates and secure re-encryption on transfer.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC7857 } from "../lib/erc7857/contracts/ERC7857.sol"; // or whatever path
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract ClawforgerINFT is ERC7857, Ownable2Step {
    struct AgentData {
        bytes32 intelligenceHash;       // 0G Storage pointer (encrypted system prompt + initial skills)
        bytes32 skillManifestHash;      // 0G Storage pointer (current skill manifest)
        bytes32 memoryRootHash;         // 0G KV root (current state)
        address royaltyVault;           // RoyaltyVault contract for this agent
        uint256 evolvedAt;              // unix seconds of last metadata update
    }

    mapping(uint256 tokenId => AgentData) public agents;

    event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault);
    event AgentEvolved(uint256 indexed tokenId, bytes32 newSkillManifestHash, bytes32 newMemoryRootHash, uint256 ts);

    error NotTokenOwner();
    error EmptyHash();

    function mintAgent(
        address to,
        bytes32 intelligenceHash,
        bytes32 skillManifestHash,
        address royaltyVault
    ) external returns (uint256 tokenId);

    function evolveAgent(
        uint256 tokenId,
        bytes32 newSkillManifestHash,
        bytes32 newMemoryRootHash
    ) external; // only token owner

    function transferWithReencryption(
        uint256 tokenId,
        address to,
        bytes calldata reencryptedKey  // ERC-7857 secure transfer payload
    ) external;

    function tokenURI(uint256 tokenId) public view override returns (string memory);
}
```

Notes:
- `tokenURI` returns `og-storage://${intelligenceHash}` (or whatever the canonical 0G URI scheme is)
- `mintAgent` deploys a fresh `RoyaltyVault` for each agent if `royaltyVault == address(0)` — saves Core agent a step
- `evolveAgent` is the hot path: called every time `skill-forge` succeeds
- Use ERC-7857's standard re-encryption hook — don't roll your own crypto

### `SkillRegistry.sol`

Trustless mirror of the 0G KV skill index.

```solidity
contract SkillRegistry {
    struct Skill {
        bytes32 artifactHash;      // 0G Storage content hash
        address ownerINFT;         // ClawforgerINFT contract address
        uint256 ownerTokenId;      // which agent owns this skill
        uint256 priceUSDC;         // x402 paywall price (6 decimals)
        string capabilityTag;      // e.g., "fetch.arxiv"
        uint64 publishedAt;
        uint32 useCount;           // increments on every paid use
    }

    mapping(bytes32 artifactHash => Skill) public skills;
    mapping(string capabilityTag => bytes32[]) public byTag;

    address public immutable INFT_CONTRACT;

    event SkillPublished(bytes32 indexed artifactHash, address indexed ownerINFT, uint256 ownerTokenId, string capabilityTag, uint256 priceUSDC);
    event SkillUsed(bytes32 indexed artifactHash, uint32 newUseCount);

    error NotINFTOwner();
    error AlreadyPublished();
    error UnknownSkill();

    constructor(address inftContract) { INFT_CONTRACT = inftContract; }

    function publishSkill(
        bytes32 artifactHash,
        uint256 tokenId,
        string calldata capabilityTag,
        uint256 priceUSDC
    ) external; // only iNFT owner of tokenId

    function recordUse(bytes32 artifactHash) external; // only RoyaltyVault or trusted x402 settlement contract

    function findByTag(string calldata tag) external view returns (bytes32[] memory);
}
```

Notes:
- `recordUse` is called after a successful x402 payment — needs auth. Simplest: a `trustedCaller` set in constructor (the RoyaltyVault address); add `onlyTrusted` modifier.
- Don't paginate `findByTag` for hackathon (cap returned array length at 50; document the limit).

### `RoyaltyVault.sol`

Per-iNFT mUSDC royalty splitter. Deployed by `ClawforgerINFT.mintAgent`. Receives mUSDC from x402 settlement, splits 5% protocol / 95% iNFT owner.

```solidity
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RoyaltyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable INFT;
    uint256 public immutable TOKEN_ID;
    address public immutable MUSDC;             // our mock USDC on 0G
    address public immutable PROTOCOL_TREASURY;
    address public immutable SKILL_REGISTRY;

    uint16 public constant PROTOCOL_BPS = 500; // 5%
    uint16 public constant OWNER_BPS = 9500;   // 95%

    event RoyaltyReceived(bytes32 indexed artifactHash, uint256 amount, address payer);
    event RoyaltyDistributed(uint256 toOwner, uint256 toProtocol);

    constructor(address inft, uint256 tokenId, address mUSDC, address treasury, address registry);

    /// @notice Called by x402 settlement — payer must have mUSDC.approve()ed this vault
    function settle(bytes32 artifactHash, uint256 amount, address payer) external nonReentrant;
}
```

Notes:
- `settle` reads current iNFT owner via `IERC721(INFT).ownerOf(TOKEN_ID)` and forwards 95% there
- Calls `SkillRegistry.recordUse(artifactHash)` after distribution
- Use SafeERC20 throughout — even our own mUSDC should be touched via SafeERC20 for muscle memory

### `MUSDC.sol`

Minimal mock USDC ERC-20. 6 decimals. Permissionless mint so any agent can self-fund for the demo. Ship the smallest possible thing.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MUSDC is ERC20 {
    constructor() ERC20("Mock USDC (Clawforger)", "mUSDC") {}

    /// @notice Permissionless mint — testnet only, do NOT deploy this on mainnet
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;  // match real USDC
    }
}
```

Notes:
- Add a banner comment in the source making it clear this is testnet-only
- The Demo agent can fund any wallet with `cast send <mUSDC> "mint(address,uint256)" <wallet> 1000000000` (1000 mUSDC)
- No supply cap, no admin, no pause — keep it dumb

## Tests (Foundry)

Minimum coverage:

```
test/ClawforgerINFT.t.sol
  - testMintAgent
  - testEvolveOnlyOwner
  - testEvolveEmitsEvent
  - testTransferWithReencryption
  - testTokenURIReflectsLatestEvolution

test/SkillRegistry.t.sol
  - testPublishOnlyOwner
  - testPublishDuplicateReverts
  - testFindByTag
  - testRecordUseOnlyTrusted

test/RoyaltyVault.t.sol
  - testSettleSplits5_95
  - testSettleEmitsEvents
  - testSettleReentrancyBlocked
  - testSettleForwardsToCurrentOwner (transfer iNFT mid-flight)

test/MUSDC.t.sol
  - testMintToAnyone
  - testDecimalsIs6
```

Run: `forge test -vvv`. All green is required before deploy.

## Deploy script

`script/Deploy.s.sol` deploys all four contracts to 0G Galileo testnet in one transaction sequence.

```solidity
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Mock USDC first (everyone else needs the address)
        MUSDC mUSDC = new MUSDC();

        // 2. iNFT contract
        ClawforgerINFT inft = new ClawforgerINFT(/* args */);

        // 3. Skill registry referencing the iNFT
        SkillRegistry registry = new SkillRegistry(address(inft));

        // 4. RoyaltyVault template — actual per-agent vaults are deployed
        //    by ClawforgerINFT.mintAgent at mint time (CREATE2 factory pattern).
        //    The template here is a reference for ABI export and inspection.
        RoyaltyVault template = new RoyaltyVault(
            address(inft), 0, address(mUSDC), msg.sender, address(registry)
        );

        vm.stopBroadcast();

        // Write addresses.json — all on 0G, no second chain
        string memory json = string(abi.encodePacked(
          '{"chains":{"0g-galileo-testnet":{',
            '"ClawforgerINFT":"', vm.toString(address(inft)), '",',
            '"SkillRegistry":"', vm.toString(address(registry)), '",',
            '"RoyaltyVaultTemplate":"', vm.toString(address(template)), '",',
            '"mUSDC":"', vm.toString(address(mUSDC)), '"',
          '}}}'
        ));
        vm.writeFile("../addresses.json", json);
    }
}
```

Deploy command (one chain only):

```bash
forge script script/Deploy.s.sol --rpc-url 0g-galileo --broadcast --slow
```

## ABI export — your handoff to Core

After deploy, run:

```bash
mkdir -p ../packages/core/src/abis
forge inspect ClawforgerINFT abi > ../packages/core/src/abis/ClawforgerINFT.json
forge inspect SkillRegistry abi > ../packages/core/src/abis/SkillRegistry.json
forge inspect RoyaltyVault abi > ../packages/core/src/abis/RoyaltyVault.json
forge inspect MUSDC abi > ../packages/core/src/abis/MUSDC.json
```

Commit these files. Core will import them via `import abi from './abis/ClawforgerINFT.json'`.

## Day-by-day plan (your slice of ROADMAP.md)

### Day 0 (afternoon)
- [ ] Foundry installed, `forge --version` works
- [ ] `contracts/foundry.toml` and `.env` configured
- [ ] OpenZeppelin + ERC-7857 reference imported
- [ ] Wallet funded on 0G Galileo testnet (single faucet — no other chain)

### Day 1 (full day)
- [ ] Write all 4 contracts (ClawforgerINFT, SkillRegistry, RoyaltyVault, MUSDC)
- [ ] Write all tests, get to green
- [ ] `forge coverage` ≥ 80% line coverage
- [ ] Deploy to 0G Galileo testnet (single chain)
- [ ] Write `addresses.json` at repo root with all four addresses
- [ ] Export ABIs to `packages/core/src/abis/`
- [ ] Manually mint one test iNFT via `cast send` — confirm event emitted, `tokenURI` resolves
- [ ] Manually mint 1000 mUSDC to your deployer + a Demo wallet via `cast send` — confirm balance via `cast call`

### Days 2–4 (on call)
- Bug fixes only — no scope expansion
- If Core or Execution agent reports a contract issue, **fix and redeploy**, update `addresses.json`, notify in `BLOCKERS.md`

### Day 5+
- Idle, unless you're tapped to help with a bonus track (e.g., ENS resolver contract)

## Definition of done

- [ ] All 3 contracts deployed on testnet, addresses confirmed via block explorer
- [ ] `forge test` green, coverage ≥ 80%
- [ ] `addresses.json` committed at repo root
- [ ] ABI files committed to `packages/core/src/abis/`
- [ ] At least one test iNFT minted on-chain, viewable on 0G explorer
- [ ] No `BLOCKERS.md` entries that point at you

## Coordination notes

- **Core consumes you Day 2.** Make sure ABIs are in place by EOD Day 1.
- **Execution consumes you Day 4.** Same ABIs apply.
- **Don't change function signatures after Day 1 without notice.** A signature change cascades to 4 other terminals.
- If you finish Day 1 early, write a `MINT-WALKTHROUGH.md` showing how to mint one agent end-to-end with `cast` commands. The Demo agent will love you for it.

## Anti-patterns (specific to your terminal)

- **Don't write fancy upgradeable contracts.** This is a 7-day hackathon. Plain immutable contracts. No proxies.
- **Don't try to implement ERC-7857 from scratch.** Fork the reference, extend.
- **Don't skip `forge test`.** A bug in your contracts means 4 other terminals waste time chasing ghosts.
- **Don't hardcode the protocol treasury address.** Make it a constructor arg, default to your deployer wallet.

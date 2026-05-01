# Architecture

## High-level system diagram

```
                          ┌──────────────────────┐
                          │   Clawforger Studio   │ (web UI: mint, evolve, browse)
                          └──────────┬───────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────┐
│                       @clawforger/core                          │
│  Agent runtime: lifecycle, hooks, plan→act loop, sandbox       │
└────┬─────────┬──────────┬───────────┬───────────┬─────────────┘
     │         │          │           │           │
     ▼         ▼          ▼           ▼           ▼
┌─────────┐┌────────┐┌────────────┐┌──────────┐┌─────────────────┐
│ inft-   ││ skill- ││ memory-0g  ││ x402-    ││ keeperhub-      │
│ identity││ forge  ││ (KV+Log)   ││ skill-   ││ execute         │
│         ││        ││            ││ market   ││                 │
└────┬────┘└───┬────┘└─────┬──────┘└────┬─────┘└────┬────────────┘
     │        │            │            │           │
     ▼        ▼            ▼            ▼           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sponsor primitives                        │
│  0G Chain (ERC-7857)  │  0G Storage  │  0G Compute (TEE)    │
│  KeeperHub MCP/CLI    │  x402 paywall + Foundation registry │
│  (optional) ENS subnames | Uniswap API | AXL P2P mesh        │
└─────────────────────────────────────────────────────────────┘
```

## Module breakdown

### `@clawforger/core`

The runtime. Exposes:

```ts
class Agent {
  inft: INFTRef;                    // pointer to ERC-7857 token
  memory: Memory;                   // injected (default: 0G)
  inference: Inference;             // injected (default: 0G Compute)
  executor: Executor;               // injected (default: KeeperHub)
  skills: SkillManifest[];          // loaded from iNFT metadata

  async run(task: Task): Promise<Result>;
  async evolve(failedTask: Task): Promise<Skill | null>;
}
```

Hooks: `beforeInference`, `afterInference`, `beforeExecute`, `afterExecute`, `onEvolve`, `onSkillPublish`. Plugins (e.g., `openclaw-plugin-keeperhub`) attach via these hooks.

### `@clawforger/inft-identity`

ERC-7857 SDK wrapper. Operations:

- `mintAgent(systemPrompt, initialSkills) → tokenId` — encrypts payload (AES-256-GCM with per-token key), uploads to 0G Storage, mints with metadata URI
- `transferAgent(tokenId, to)` — uses ERC-7857's secure re-encryption: TEE re-keys the payload to recipient's pubkey before transfer settles
- `updateMetadata(tokenId, newSkillManifestHash)` — emits `MetadataUpdate` event, points iNFT to new 0G Storage URI

### `@clawforger/skill-forge`

The self-evolution loop:

```ts
async evolve(agent, failedTask): Promise<Skill | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = await agent.inference.generateCode({
      task: failedTask,
      existingSkills: agent.skills,
      style: 'typescript-bun-isolate'
    });
    const result = await sandbox.run(code, failedTask.successCriteria);
    if (result.passed) {
      const artifact = await uploadToZG(code);             // 0G Storage Log
      await registerInKV(artifact.hash, skillManifest);    // 0G KV
      await agent.inft.updateMetadata(skillManifest);      // ERC-7857 dynamic update
      await x402Market.publish(artifact, priceUSDC);       // x402 paywall endpoint
      return { hash: artifact.hash, manifest: skillManifest };
    }
  }
  return null;
}
```

Sandbox: Bun isolated workers initially; wasm migration path documented for production.

### `@clawforger/memory-0g`

Implements the `Memory` interface against 0G Storage:

- **KV operations** for hot state (current task, working memory) — `get`, `set`, `delete`
- **Log operations** for audit trail (every inference, every action, every skill publish) — `append`, `read`, `verify`
- AES-256-GCM client-side encryption with key derived from iNFT owner's signature
- Key rotation on iNFT transfer (handled by inft-identity module)

### `@clawforger/x402-skill-market`

The skill marketplace:

- **Publish flow**: skill artifact → register endpoint → return 402 with `Payment-Required: USDC X.XX` until USDC payment receipt is presented
- **Discover flow**: query 0G KV registry by capability tag → returns ranked list of `(skillHash, endpoint, priceUSDC, ownerINFT)` rows
- **Pay flow**: agent submits USDC payment via x402-compliant client (Coinbase Commerce SDK or our shim), gets receipt, retries call with `Payment-Receipt` header
- **Settle flow**: payment receipt verified → KeeperHub workflow triggered to split USDC into 5% protocol / 95% iNFT-owner via on-chain RoyaltyVault

### `@clawforger/keeperhub-execute`

Implements the `Executor` interface against KeeperHub MCP:

```ts
class KeeperHubExecutor implements Executor {
  async execute(intent: ExecutionIntent): Promise<TxResult> {
    // 1. Compile intent → KeeperHub workflow JSON
    const workflow = compileToWorkflow(intent);

    // 2. Submit via MCP tool call (workflows.create + workflows.run)
    const runId = await this.mcp.call('workflows.create_and_run', { workflow });

    // 3. Poll for completion (KeeperHub handles retries, gas, nonce internally)
    return await this.mcp.pollUntilComplete(runId);
  }
}
```

Supports:
- Smart contract reads/writes
- Native + ERC-20 transfers
- Conditional branching (e.g., "if balance > X, swap; else, hold")
- Block-event triggered workflows for ongoing autonomy

x402 settlement is implemented as a KeeperHub workflow template — payment-in triggers RoyaltyVault.split() with retry-safety.

## Smart contracts

### `ClawforgerINFT.sol` (ERC-7857)

```solidity
contract ClawforgerINFT is ERC7857 {
    struct AgentData {
        bytes32 intelligenceHash;       // 0G Storage pointer to encrypted blob
        bytes32 skillManifestHash;      // 0G Storage pointer to skill list
        bytes32 memoryRootHash;         // 0G KV root for current state
        address royaltyVault;           // RoyaltyVault contract for this agent
        uint256 evolvedAt;              // last metadata update timestamp
    }
    mapping(uint256 => AgentData) public agents;

    function mintAgent(...) external returns (uint256);
    function evolveAgent(uint256 tokenId, bytes32 newSkillHash, bytes32 newMemoryRoot) external onlyOwner;
    function transferWithReencryption(uint256 tokenId, address to, bytes calldata reencryptedKey) external;
}
```

### `SkillRegistry.sol`

Onchain mirror of the 0G KV registry — used for discovery when KV is unavailable, and for trustless audit:

```solidity
struct Skill {
    bytes32 artifactHash;       // 0G Storage pointer
    address ownerINFT;          // ClawforgerINFT contract
    uint256 ownerTokenId;       // which agent owns this skill
    uint256 priceUSDC;          // x402 paywall price
    string capabilityTag;       // e.g., "fetch.arxiv"
    uint64 publishedAt;
    uint32 useCount;            // increments on every paid use
}
mapping(bytes32 => Skill) public skills;
```

### `RoyaltyVault.sol`

Per-iNFT royalty splitter. Receives USDC from x402 settlements, splits 5% to protocol treasury and 95% to current iNFT owner. ReentrancyGuard + SafeERC20.

## Data flow: end-to-end skill use

```
Writer Agent                                     Researcher Agent
     │                                                  │
     │ 1. KV.query("fetch.arxiv")                       │
     ├─────────────────────────────────────────────────▶│
     │                                                  │ 2. returns endpoint + price
     │◀─────────────────────────────────────────────────┤
     │ 3. HTTP GET /skill/fetch.arxiv?paper=2604.27264  │
     ├─────────────────────────────────────────────────▶│
     │                                                  │ 4. HTTP 402 + payment spec
     │◀─────────────────────────────────────────────────┤
     │ 5. KeeperHub.execute({ transferUSDC: 0.05 })     │
     ├──────────▶ KeeperHub MCP                         │
     │                  │                               │
     │                  ├──▶ x402 settlement contract ──┤ 6. emits PaymentReceipt
     │                  │                               │
     │                  └──▶ RoyaltyVault.split() ──────┤ 7. 0.0475 USDC arrives at iNFT owner
     │ 8. retry GET with payment-receipt                │
     ├─────────────────────────────────────────────────▶│
     │                                                  │ 9. executes skill, returns paper text
     │◀─────────────────────────────────────────────────┤
     │ 10. updates own iNFT memory with result          │
```

Every numbered step is verifiable: KV reads, HTTP requests, KeeperHub workflow logs, on-chain receipts.

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun 1.2+ | Fast iteration, isolated workers for sandbox, native TS, single binary |
| Language | TypeScript 5.6+ | Type safety across module boundaries |
| Smart contracts | Solidity 0.8.26 + Foundry | ERC-7857 reference impl is in Solidity; Foundry for fast tests |
| Chain (everything) | 0G Galileo testnet (chainId 16602), targeting 0G Aristotle Mainnet for production | All-in on 0G — iNFTs, registry, royalty vault, and a mock USDC (mUSDC) we deploy ourselves all live here. No second chain. |
| Settlement asset | `mUSDC` — our own ERC-20 deployed on 0G | Hackathon testnet has no real USDC; mUSDC is fungible-equivalent for x402 micropayments. Ships in `contracts/MUSDC.sol` with permissionless mint for the demo. |
| x402 facilitator | Self-hosted (`packages/x402-facilitator`) | No public x402 facilitator exists on 0G yet — we run our own ~150-LOC verifier and pitch it as the first 0G x402 facilitator. Strong Builder Feedback Bounty submission for the x402 Foundation. |
| Frontend | Vite 6 + React 19 + wagmi + RainbowKit + Tailwind 4 | Fast HMR, no SSR overhead — pure SPA fits a studio dashboard, judges-friendly |
| Inference | 0G Compute broker (`@0glabs/0g-serving-broker`) | Track requirement; qwen3.6-plus or GLM-5-FP8 |
| Storage | `@0gfoundation/0g-ts-sdk` for KV + Log | Track requirement |
| Execution | KeeperHub MCP — verify 0G chain support on Day 0 | Track requirement. KeeperHub docs say "EVM-compatible chains"; if 0G isn't explicitly listed we file a feature request and use the gap as Builder Feedback. |
| x402 client | Hand-rolled (`packages/x402-client`) following the x402 spec | Coinbase SDK is Base-centric; we ship a chain-agnostic client that targets our facilitator. |
| Sandbox | Bun isolated workers (Phase 1) → wasm runtime (Phase 2) | Pragmatic safety progression |

## What we explicitly will NOT build

- A custom LLM
- Our own L2 / chain
- A novel consensus or DA mechanism
- Cross-chain bridging
- A token (iNFTs are not fungible; no $CLAW)

These are all rabbit holes that look impressive but kill hackathon timelines.

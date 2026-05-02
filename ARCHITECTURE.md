# Architecture

## High-level system diagram

```
                          ┌──────────────────────┐
                          │   Clawforger Studio   │ (Vite + React: mint, chat, wallets)
                          └──────────┬───────────┘
                                     │  REST + chat over HTTPS
                                     ▼
┌───────────────────────────────────────────────────────────────┐
│              x402-skill-market (Hono on :3700)                 │
│  /admin/chat       /admin/agent/:id/wallet      /skills        │
│  /skill/:hash      /admin/compute-balance       /admin/memory  │
└────┬─────────┬──────────┬───────────┬───────────┬─────────────┘
     │         │          │           │           │
     ▼         ▼          ▼           ▼           ▼
┌─────────┐┌────────┐┌────────────┐┌──────────┐┌─────────────────┐
│ inft-   ││ skill- ││ memory-0g  ││ x402-    ││ keeperhub-      │
│ identity││ forge  ││ (KV+Log)   ││ facili-  ││ execute (MCP)   │
│         ││        ││            ││ tator    ││                 │
└────┬────┘└───┬────┘└─────┬──────┘└────┬─────┘└────┬────────────┘
     │        │            │            │           │
     ▼        ▼            ▼            ▼           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Sponsor + chain primitives                  │
│  0G Galileo testnet (16602): contracts, mUSDC, RoyaltyVaults │
│  0G Aristotle mainnet (16661): Compute (DeepSeek V3, etc.)   │
│  KeeperHub MCP: workflow gen + (where supported) broadcast   │
│  x402 + EIP-712: settlement primitive                        │
└─────────────────────────────────────────────────────────────┘
```

The studio is a thin frontend. The marketplace server is the orchestrator: it holds the master wallet seed, signs transactions on agents' behalf, runs the chat tool loop with DeepSeek, and dispatches `purchase_skill` / `evolve_new_skill` / direct skill calls.

## The hybrid mainnet/testnet posture

- **Inference** runs on 0G Aristotle **mainnet** (chainId 16661). Aristotle's broker serves DeepSeek V3, GLM-5/5.1-FP8, gpt-5.4-mini. Galileo testnet's broker only has qwen-2.5-7b which hallucinates and emits non-OpenAI tool-call format.
- **Contracts** run on 0G Galileo **testnet** (chainId 16602). Aristotle has no canonical USDC, no LayerZero endpoint, no bridged stable as of writing — deploying contracts there gains nothing over testnet.

The split is decoupled at the env level: `ZG_COMPUTE_RPC` points at mainnet, `ZG_GALILEO_RPC` at testnet. The `ZGComputeInference` class connects to compute via the former; everything else uses the latter.

## Per-agent deterministic sub-wallets

Every iNFT (by tokenId) has a unique signing wallet derived from a server master seed:

```ts
// @clawforger/core/agent-wallet
export function getAgentWallet(tokenId: bigint, seed: Hex) {
  const tokenBytes = toHex(tokenId, { size: 32 });
  const privateKey = keccak256(toBytes(seed + tokenBytes.slice(2)));
  return { address: privateKeyToAccount(privateKey).address, privateKey, tokenId };
}
```

Properties:
- **Deterministic** — token #5 always maps to the same address. No off-chain mapping table needed.
- **Custodial, server-side** — the master seed lives in `AGENT_WALLET_SEED` env. The frontend never sees a private key. ERC-4337 / wallet delegation is the production fix; for hackathon scope, custodial is acceptable.
- **Browser-safe** — derivation uses only viem's `keccak256` + `privateKeyToAccount`. No Node crypto / randombytes — the studio bundle stays clean.
- **Funded externally** — `scripts/fund-agent.ts <tokenId> <mUSDC> [0G]` sends mUSDC + a 0G gas top-up from the deployer to any agent's address.

Two distinct addresses per agent:
- **Signing wallet** — sends txes (e.g. mUSDC.transfer when buying skills)
- **RoyaltyVault** — receives mUSDC when *its* skills are bought; per-iNFT contract clone deployed at mint

## Persona presets

Four personas, each with a curated codegen hint:

| Persona | Role | Avatar | Preferred APIs (all no-auth) | `isConsumer` |
|---|---|---|---|---|
| **Researcher** | Producer | violet→fuchsia, Brain | arXiv, Wikipedia REST, Semantic Scholar, CrossRef | – |
| **Writer** | Producer | amber→rose, FileText | Wikipedia REST, LibreTranslate, raw fetch + indexOf | – |
| **Trader** | Producer | emerald→teal, TrendingUp | CryptoCompare (symbol-based, FIRST), CoinPaprika, CoinGecko (with slug map), DeFiLlama | – |
| **Analyst** | **Consumer** | **cyan→blue, Search** | (none — Analysts buy, don't forge) | **true** |

`packages/core/src/personas.ts` is the single source of truth — `apps/studio/src/routes/Mint.tsx` reads its preset buttons from `PERSONAS`, the marketplace server's chat handler imports `detectPersona` + `buildPersonaCodegenHint` from the same module.

When `detectedPersona.isConsumer === true`, the chat handler injects an extra system directive: *"prefer purchase_skill over evolve_new_skill, preview every buy before spending, emit a structured receipt with tx link."*

## Agent-to-agent commerce — purchase_skill flow

```
Analyst chat: "Get me ETH price"
        │
        ▼
[1] Marketplace listing in system prompt (rendered with schemaIn from local artifact decryption):
        - capability: "price.token" — owner: iNFT #3 — price: 0.05 mUSDC — inputs: {symbol: string}
        - capability: "wiki.lookup" — owner: iNFT #4 — price: 0.05 mUSDC — inputs: {topic: string}
        - …
        │
        ▼
[2] LLM invokes: purchase_skill({ capabilityTag: "price.token", inputs: { symbol: "ETH" } })
        │
        ▼
[3] purchaseSkillForAgent (server-side):
        a. Look up skill by tag in marketplace registry
        b. Self-purchase rejected if buyer == producer
        c. Derive buyer's sub-wallet from AGENT_WALLET_SEED + buyerTokenId
        d. Pre-flight: buyer mUSDC >= price && buyer 0G >= 0.001
        e. Look up producer's RoyaltyVault address via iNFT.agents(producerTokenId).royaltyVault
        f. Buyer wallet signs mUSDC.transfer(vault, price)
        g. Poll eth_getTransactionReceipt(hash) — verify THIS specific hash mined
        h. runForgedSkill(skill.hash, inputs):
              fetchBlob(hash) → decrypt(serverKey, blob) → new Function(code) → execute
        i. Return { ok, txHash, paidMUSDC, toVault, result }
        │
        ▼
[4] Receipt rendered in chat with auto-linked chainscan URL:
        **Bought:** `price.token` from iNFT #3
        **Paid:**  0.0500 mUSDC → vault `0x9F3642…`
        **Tx:**    [0xabc…d4e](https://chainscan-galileo.0g.ai/tx/0xabc…d4e)
        **Result:** ETH = $2,310.99 USD (CryptoCompare)
```

Receipt verification (step 3g) is critical — earlier impl polled the buyer's balance for a drop, which had a false-positive on concurrent buys. Fixed in commit `1c607ec` to verify the specific tx hash made it on chain.

## Self-evolution flow — evolve_new_skill

```ts
// packages/skill-forge/src/index.ts
async function evolve(opts) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const codegen = await opts.agent.inference.generateCode({
      task: opts.task,
      existingSkills: opts.agent.skills,
      style: 'typescript-bun-isolate',
      personaContext: opts.personaContext,   // ← buildPersonaCodegenHint(persona)
    });
    const result = await sandbox.run({ code: codegen.code, ... });
    if (!result.passed) continue;

    // Encrypted artifact = { code, schemaIn, schemaOut, capabilityTag, reasoning }
    const blob = await encrypt(opts.encryptionKey, codegen);
    const hash = await opts.storage.uploadBlob(blob);

    // Optional: iNFT.evolveAgent — soft-fails if server isn't owner (NotTokenOwner).
    // SkillRegistry.publishSkill still runs (server is TRUSTED_PUBLISHER).

    return { ok: true, skill: { hash, capabilityTag, schemaIn, schemaOut, ... } };
  }
}
```

Server-side `forgeSkillForAgent` wraps `evolve` with persona detection, then publishes on-chain via `SkillRegistry.publishSkill(hash, tokenId, tag, priceUSDC)`. The `TRUSTED_PUBLISHER` modifier on SkillRegistry lets the server publish skills for any user-owned iNFT (otherwise the user would have to sign every publish themselves).

## On-chain registry sync — schemaIn hydration

`SkillPublished` events on chain carry only `(artifactHash, capabilityTag, ownerTokenId, priceUSDC)`. JSON schemas live inside the encrypted artifact blob. On startup, `syncFromChain`:

1. Queries all `SkillPublished` events from `earliest` to `latest`
2. For each new skill, fetches the local artifact blob and decrypts to extract `schemaIn` + `schemaOut`
3. If the blob isn't in local storage (skill published on a different machine), falls back to empty schemas

This lets the marketplace listing render `inputs: {symbol: string}` instead of `inputs: {}`, which lets DeepSeek pass correct keys when calling another agent's skill.

## Smart contracts

### `ClawforgerINFT.sol` (ERC-7857)

```solidity
contract ClawforgerINFT is ERC7857 {
    struct AgentData {
        bytes32 intelligenceHash;       // 0G Storage pointer to encrypted persona blob
        bytes32 skillManifestHash;      // 0G Storage pointer to skill list
        bytes32 memoryRootHash;         // 0G KV root for current state
        address royaltyVault;           // RoyaltyVault contract for this agent
        uint64 evolvedAt;               // last metadata update timestamp
    }
    mapping(uint256 => AgentData) public agents;

    function mintAgent(...) external returns (uint256);
    function evolveAgent(uint256 tokenId, bytes32 newSkillHash, bytes32 newMemoryRoot) external onlyOwner;
    function transferWithReencryption(uint256 tokenId, address to, bytes calldata reencryptedKey) external;
}
```

### `SkillRegistry.sol`

On-chain skill index, the source of truth for marketplace discovery:

```solidity
struct Skill {
    bytes32 artifactHash;       // 0G Storage pointer
    address ownerINFT;          // ClawforgerINFT contract
    uint256 ownerTokenId;       // which agent owns this skill
    uint256 priceUSDC;          // x402 paywall price (mUSDC base units)
    string capabilityTag;       // e.g., "price.token"
    uint64 publishedAt;
    uint32 useCount;            // increments on every paid use
}

address public immutable TRUSTED_PUBLISHER;   // server-side address
function publishSkill(...) external onlyOwnerOrTrustedPublisher;
```

### `RoyaltyVault.sol`

Per-iNFT royalty splitter. Receives mUSDC from x402 settlements, splits 5% protocol / 95% iNFT-owner. ReentrancyGuard + SafeERC20.

### `MUSDC.sol`

Mock USDC for testnet. 6 decimals. Permissionless `mint(to, amount)` so anyone can fund any agent for the demo.

## What we explicitly will NOT build

- A custom LLM
- Our own L2 / chain
- Cross-chain bridging
- A token (iNFTs are not fungible; no $CLAW)
- Non-custodial per-agent wallets (ERC-4337 / wallet delegation) — production direction, out of scope for hackathon

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun 1.2+ | Fast iteration, native TS, isolated workers for sandbox |
| Language | TypeScript 5.6+ | Type safety across module boundaries |
| Smart contracts | Solidity 0.8.26 + Foundry | ERC-7857 ref impl is in Solidity; Foundry for fast tests |
| Inference | 0G Compute on Aristotle mainnet | `@0gfoundation/0g-compute-ts-sdk` (formerly `@0glabs/0g-serving-broker`); DeepSeek V3 default |
| Storage | `FileBackedZGStorage` (drop-in for `RealZGStorageClient`) | Local single-file persistence for hackathon; swap to real 0G Storage SDK at deploy time |
| Execution | KeeperHub MCP — verified 0G chain support, documented blocking bug | `@modelcontextprotocol/sdk` Streamable HTTP transport |
| x402 client | Hand-rolled (`packages/x402-client`) following the x402 spec | Coinbase SDK is Base-centric; we ship a chain-agnostic client targeting our facilitator |
| Sandbox | Bun isolated workers (Phase 1) → wasm runtime (Phase 2) | Pragmatic safety progression |

# AGENT-CORE — Runtime + 0G Integrations Terminal

You are the **core runtime engineer** for Clawforger. You own the agent runtime, the iNFT identity SDK, the 0G memory layer, and the self-evolution skill forge. This is the soul of the framework — the set of packages other developers `import` to build agents on Clawforger.

## Mission

Deliver a working agent runtime by **end of Day 3** that can:

1. Mint a Clawforger agent as an ERC-7857 iNFT on 0G (via `inft-identity`)
2. Run inference through 0G Compute TEE broker (via `core`)
3. Persist memory to 0G Storage KV + Log (via `memory-0g`)
4. Self-evolve a new skill: generate code → sandbox-test → upload artifact → update iNFT metadata (via `skill-forge`)

By Day 3 EOD, `bun examples/researcher` should mint, reason, and successfully evolve one new skill end-to-end on-chain.

## Read before starting

- [AGENTS.md](AGENTS.md) — read the **Shared interface contracts** section. You define them; everyone consumes them.
- [ARCHITECTURE.md](ARCHITECTURE.md) — sections on `@clawforger/core`, `inft-identity`, `memory-0g`, `skill-forge`
- [CONCEPT.md](CONCEPT.md) — the self-evolution loop is the headline feature
- 0G iNFT docs: https://docs.0g.ai/build-with-0g/inft
- 0G Storage SDK: https://docs.0g.ai/build-with-0g/storage
- 0G Compute broker: https://github.com/0glabs/0g-serving-broker

## Scope

### You own
- `packages/core/` — runtime, types, hooks, plan→act loop
- `packages/inft-identity/` — ERC-7857 SDK wrapper (mint, transfer, evolve)
- `packages/memory-0g/` — 0G Storage KV + Log adapter with encryption
- `packages/skill-forge/` — self-evolution loop, code-gen, sandbox harness
- `packages/core/src/types.ts` — **the canonical shared types** (consumed by every other agent)
- `packages/core/src/abis/*.json` — ABIs imported here (Contracts agent writes them)

### You don't own
- The Solidity contracts themselves (Contracts agent owns `contracts/`)
- KeeperHub or x402 integrations (Execution agent — but you define the `Executor` interface they implement)
- The Studio frontend (UI agent)
- Demo scripts (Demo agent — but you ship the `examples/researcher` reference)

## Tech stack

| Tool | Version | Why |
|------|---------|-----|
| Bun | 1.2+ | Fast TS execution, native worker isolation for sandbox, single binary |
| TypeScript | 5.6+ | Type safety across module boundaries |
| viem | 2.21+ | EVM client (lightweight; reading + writing iNFTs) |
| `@0glabs/0g-serving-broker` | latest | TEE inference broker |
| `@0gfoundation/0g-ts-sdk` | latest | 0G Storage Log + KV |
| `node:crypto` (subtle) | builtin | AES-256-GCM for client-side encryption |
| `vitest` or `bun:test` | latest | Tests |

Monorepo manager: **Turborepo** + Bun workspaces.

## Setup

From repo root:

```bash
bun init -y
# Convert to monorepo
echo '{"workspaces":["packages/*","apps/*","examples/*"]}' > package.json # merge into existing
bun add -D turbo typescript @types/node tsup vitest
mkdir -p packages/{core,inft-identity,memory-0g,skill-forge}/src
```

Per-package `package.json` template:

```json
{
  "name": "@clawforger/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "bun test"
  },
  "dependencies": {
    "viem": "^2.21.0"
  }
}
```

## Package specs

### `packages/core`

The runtime. Defines the `Agent` class and all shared types.

```
packages/core/src/
├── index.ts             # public exports
├── types.ts             # canonical shared types (see AGENTS.md)
├── agent.ts             # Agent class
├── hooks.ts             # hook system
├── abis/                # populated by Contracts agent
│   ├── ClawforgerINFT.json
│   ├── SkillRegistry.json
│   └── RoyaltyVault.json
└── chains.ts            # chain configs (0G Galileo + 0G Aristotle — single-chain stack)
```

`agent.ts`:

```typescript
import type { INFTRef, Memory, Inference, Executor, Task, Result, SkillManifest } from './types';

export class Agent {
  constructor(
    public readonly inft: INFTRef,
    private readonly memory: Memory,
    private readonly inference: Inference,
    private readonly executor: Executor,
    public skills: SkillManifest[] = [],
    private hooks: Hooks = {}
  ) {}

  static async load(inft: INFTRef, opts: AgentOpts): Promise<Agent> {
    // 1. Read AgentData from iNFT contract via viem
    // 2. Decrypt intelligence blob from 0G Storage (memory-0g handles)
    // 3. Load skill manifest from 0G Storage
    // 4. Construct
  }

  async run(task: Task): Promise<Result> {
    await this.hooks.beforeInference?.(task);
    // 1. Try existing skills (matched by capabilityTag against task)
    // 2. If none match, ask LLM to plan (inference.generate)
    // 3. Execute plan (executor.execute)
    // 4. Persist result (memory.logAppend)
    await this.hooks.afterInference?.(task);
    return result;
  }

  async evolve(failedTask: Task): Promise<SkillManifest | null> {
    // delegated to skill-forge
  }
}
```

### `packages/inft-identity`

Thin SDK over `ClawforgerINFT.sol`. No business logic — just convenience wrappers around viem calls + 0G Storage uploads.

Key functions:

```typescript
export async function mintAgent(opts: {
  to: Address;
  systemPrompt: string;            // gets encrypted client-side, uploaded to 0G Storage
  initialSkills?: SkillManifest[];
  signer: WalletClient;
  chain: '0g-aristotle' | '0g-galileo-testnet';
}): Promise<{ tokenId: bigint; intelligenceHash: Hex; royaltyVault: Address }>;

export async function evolveAgent(opts: {
  inft: INFTRef;
  newSkillManifest: SkillManifest[];
  newMemoryRoot: Hex;
  signer: WalletClient;
}): Promise<{ txHash: Hex }>;

export async function readAgentData(inft: INFTRef, client: PublicClient): Promise<AgentData>;

export async function transferWithReencryption(opts: {
  inft: INFTRef;
  to: Address;
  recipientPubkey: Hex;
  signer: WalletClient;
}): Promise<{ txHash: Hex; reencryptedKey: Hex }>;
```

Use the encryption helpers from `memory-0g`. Don't reimplement AES.

### `packages/memory-0g`

Implements the `Memory` interface against 0G Storage. Handles client-side encryption.

```typescript
export class ZGMemory implements Memory {
  constructor(private opts: {
    storageBroker: ZGStorageClient;
    encryptionKey: CryptoKey;       // derived from iNFT owner's signature
  }) {}

  async kvGet(key: string): Promise<unknown | null> {
    const blob = await this.opts.storageBroker.kv.get(this.namespacedKey(key));
    if (!blob) return null;
    return this.decrypt(blob);
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    const encrypted = await this.encrypt(value);
    await this.opts.storageBroker.kv.put(this.namespacedKey(key), encrypted);
  }

  async logAppend(entry): Promise<Hex> {
    const encrypted = await this.encrypt(entry);
    return await this.opts.storageBroker.log.append(encrypted);
  }

  // ... etc
}

// Helper for Inft-identity to derive encryption key from owner signature
export async function deriveKeyFromSignature(sig: Hex): Promise<CryptoKey>;

// AES-256-GCM helpers
export async function encrypt(key: CryptoKey, data: unknown): Promise<Uint8Array>;
export async function decrypt(key: CryptoKey, data: Uint8Array): Promise<unknown>;
```

Key derivation: HKDF over the owner's signature on a fixed challenge string. On iNFT transfer, the new owner re-signs the challenge → new key → re-encrypt blobs (this is the ERC-7857 secure transfer flow).

### `packages/skill-forge`

The self-evolution loop. This is your headline deliverable.

```typescript
export async function evolve(agent: Agent, failedTask: Task): Promise<SkillManifest | null> {
  const MAX_ATTEMPTS = 3;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    // 1. Generate candidate skill code
    const code = await agent.inference.generateCode({
      task: failedTask,
      existingSkills: agent.skills,
      style: 'typescript-bun-isolate'
    });

    // 2. Sandbox-test
    const testResult = await sandbox.run({
      code,
      task: failedTask,
      timeoutMs: 10_000,
      memoryLimitMB: 128
    });

    if (!testResult.passed) continue;

    // 3. Upload artifact to 0G Storage (Log)
    const artifactHash = await agent.memory.logAppend({
      kind: 'skill-artifact',
      data: { code, schemaIn: testResult.schemaIn, schemaOut: testResult.schemaOut },
      ts: Date.now()
    });

    // 4. Build new skill manifest
    const skill: SkillManifest = {
      hash: artifactHash,
      capabilityTag: testResult.suggestedTag,
      schemaIn: testResult.schemaIn,
      schemaOut: testResult.schemaOut,
      priceUSDC: 0.05, // default; can be tuned later
      ownerINFT: agent.inft
    };

    // 5. Update iNFT metadata via inft-identity
    await evolveAgent({
      inft: agent.inft,
      newSkillManifest: [...agent.skills, skill],
      newMemoryRoot: artifactHash, // simple stand-in
      signer: agent.signer
    });

    // 6. Notify Execution layer to publish to x402 marketplace
    //    via core hook `onSkillPublish` (Execution agent registers a hook)
    await agent.hooks.onSkillPublish?.(skill);

    return skill;
  }
  return null;
}
```

**Sandbox**: use Bun's worker isolation for hackathon scope. Spawn a `Worker` with the candidate code, communicate via postMessage, hard timeout via AbortController.

```typescript
// packages/skill-forge/src/sandbox.ts
export async function run({ code, task, timeoutMs, memoryLimitMB }) {
  const worker = new Worker(new URL('./sandbox-runner.ts', import.meta.url), {
    smol: true,
  });
  // ... wire up timeout, memory check, postMessage protocol
}
```

Code-gen prompt (high-level):

```
SYSTEM: You are a skill generator for a Clawforger agent. Output a single TypeScript module
with `export async function run(input): Promise<output>`. The module runs in a Bun
isolated worker — no fs, no network beyond `fetch`, no eval. Schema-validate inputs and outputs.

USER: The agent failed task `${task.description}`. Existing skills: ${JSON.stringify(skills)}.
Generate the missing skill. Include:
- a JSON Schema for input
- a JSON Schema for output
- a suggested capabilityTag in dotted form (e.g., fetch.arxiv)
```

Force structured output via JSON mode if the LLM supports it.

## Day-by-day plan

### Day 0 (afternoon)
- [ ] Bun + Turborepo + workspaces set up
- [ ] All 4 packages scaffolded with empty exports
- [ ] `packages/core/src/types.ts` written and committed (everyone else consumes this)
- [ ] 0G Compute broker test wallet funded
- [ ] `.env` with `ZG_BROKER_URL`, `ZG_PRIVATE_KEY`, `ZG_RPC_URL`, deploy wallet

### Day 1 (full day) — wait for Contracts to deploy, then:
- [ ] Import ABIs into `packages/core/src/abis/`
- [ ] Implement `inft-identity.mintAgent` using viem + 0G Storage uploads
- [ ] Implement `inft-identity.readAgentData`
- [ ] Smoke test: mint an iNFT from a script, read it back, decrypt the intelligence blob

### Day 2 (full day)
- [ ] Implement `memory-0g` fully (KV + Log + encryption helpers)
- [ ] Round-trip test: encrypt → upload → fetch → decrypt
- [ ] Wire `Memory` into `Agent.load`
- [ ] Implement 0G Compute inference adapter (`packages/core/src/inference/zg-compute.ts`)
- [ ] Smoke test: agent runs one inference, persists result to 0G Log, can read back the log entry

### Day 3 (full day) — the headline day
- [ ] Implement `skill-forge.evolve` end-to-end
- [ ] Implement Bun worker sandbox runner with timeouts + memory caps
- [ ] Wire `Agent.evolve` → `skill-forge`
- [ ] Reference `examples/researcher`: cold agent, give it "summarize arxiv 2604.27264", watch it evolve `fetch.arxiv` skill
- [ ] **Demo-able loop end-to-end on testnet**

### Day 4+ (on call)
- [ ] Bug fixes for Execution + UI agents who consume your packages
- [ ] If time, implement the `onSkillPublish` hook properly so Execution can subscribe
- [ ] Help Demo agent build `examples/writer` (which consumes Execution's x402 client)

## Tests

```
packages/core/test/
  - types.test.ts           # type-only tests via tsc --noEmit
  - agent.test.ts           # mocked Inference/Memory/Executor

packages/inft-identity/test/
  - mint.test.ts            # against deployed testnet contract
  - readAgentData.test.ts

packages/memory-0g/test/
  - encryption.test.ts      # round-trip
  - kv.test.ts              # against 0G testnet
  - log.test.ts

packages/skill-forge/test/
  - sandbox.test.ts         # malicious code is contained
  - evolve.test.ts          # mocked inference, real sandbox
```

Run all: `bun test` from repo root (Turborepo).

## Definition of done

- [ ] All 4 packages publish-ready (`bun run build` produces `dist/`)
- [ ] `bun examples/researcher` runs end-to-end on testnet:
  - mints an iNFT
  - runs inference
  - evolves a `fetch.arxiv` skill
  - updates iNFT metadata visible on 0G explorer
- [ ] `packages/core/src/types.ts` is the single source of truth for shared types
- [ ] Test coverage ≥ 70% on core + skill-forge
- [ ] `BLOCKERS.md` clean from your side

## Coordination notes

- **You're consumed by Execution and UI from Day 2.** Stub interfaces are fine until you have real impls — Execution can mock `Memory` and `Inference` to develop.
- **Don't change `types.ts` after Day 1 without notice.** If you must, post in `BLOCKERS.md` listing every consumer.
- **The `Executor` interface is yours, but Execution implements it.** Discuss any signature change with Execution before merging.
- **The `onSkillPublish` hook is your handoff to Execution.** When `evolve()` succeeds, fire this hook with the new `SkillManifest`. Execution uses it to register the x402 paywall endpoint.

## Anti-patterns (specific to your terminal)

- **Don't try to build the framework "right".** Build the smallest thing that runs the demo. Refactor never.
- **Don't ship a "memory KV abstraction" with 5 backends.** Just 0G. The interface is there for *future* extension.
- **Don't rebuild AES.** Use `crypto.subtle` (Web Crypto). It's in Bun.
- **Don't tolerate flaky 0G Compute calls in the demo path.** Cache last-good responses; fall back to a local Ollama instance for the demo if the broker is down. Document the fallback.
- **Don't make the sandbox a vm2 / Deno deno-runtime / wasm rabbit hole.** Bun worker + timeout + AbortController is enough for a hackathon.

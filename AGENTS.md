# Multi-Agent Build Coordination

Clawforger is built by **5 parallel Claude Code terminals**, one per domain. Each terminal owns its `AGENT-*.md` file as its single source of truth and works largely independently.

This document is the **mission-control overview** — read it once at the start of the project, then spawn the 5 terminals.

## The 5 agents

| Agent | File | Owns | Tech |
|------|------|------|------|
| **Contracts** | [AGENT-CONTRACTS.md](AGENT-CONTRACTS.md) | `contracts/` — ERC-7857 iNFT, SkillRegistry, RoyaltyVault | Solidity 0.8.26, Foundry |
| **Core** | [AGENT-CORE.md](AGENT-CORE.md) | `packages/core`, `packages/inft-identity`, `packages/memory-0g`, `packages/skill-forge` | Bun + TypeScript, 0G SDKs |
| **Execution** | [AGENT-EXECUTION.md](AGENT-EXECUTION.md) | `packages/keeperhub-execute`, `packages/x402-skill-market` | Bun + TypeScript, KeeperHub MCP, x402 |
| **UI** | [AGENT-UI.md](AGENT-UI.md) | `apps/studio` | Vite + React 19, wagmi, RainbowKit, Tailwind 4 |
| **Demo** | [AGENT-DEMO.md](AGENT-DEMO.md) | `examples/`, `FEEDBACK.md`, demo video, submission packaging | Bun scripts, OBS for recording |

## How to spawn each terminal

From the `Clawforger/` directory, in five separate terminal windows:

```bash
# Terminal 1 — Contracts
cd /mnt/c/Users/revop/OneDrive/Documents/project/web3/0g-hacks/Clawforger
claude "Read AGENT-CONTRACTS.md and start working through it. You own this file end-to-end. Skip work that depends on other agents — note the blocker and continue elsewhere."

# Terminal 2 — Core
claude "Read AGENT-CORE.md and start working through it..."

# Terminal 3 — Execution
claude "Read AGENT-EXECUTION.md and start working through it..."

# Terminal 4 — UI
claude "Read AGENT-UI.md and start working through it..."

# Terminal 5 — Demo
claude "Read AGENT-DEMO.md and start working through it..."
```

Each agent should also read `CONCEPT.md`, `ARCHITECTURE.md`, and `ROADMAP.md` once for global context before starting.

## Build order (critical path)

```
Day 0  ── shared setup (everyone) ─────────────────────────────────┐
Day 1  ── CONTRACTS deploys → publishes addresses ─────────────────┤
Day 2  ── CORE consumes addresses, builds memory + identity ──────┤
Day 3  ── CORE builds skill-forge sandbox + evolution loop ───────┤
Day 4  ── EXECUTION builds KeeperHub + x402 (consumes contracts) ─┤
Day 5  ── UI consumes everything; DEMO builds examples ──────────┤
Day 6  ── polish + bonus track (ENS / Uniswap / AXL) ─────────────┤
Day 7  ── DEMO records video, packages submission ────────────────┘
```

**Parallelism rules:**
- **Contracts must ship first** — every other agent imports its addresses + ABIs
- **UI and Execution can start in parallel from Day 2** using mocks of contract calls
- **Demo agent works in shadow mode all week**, finalizing on Days 6–7

## Shared interface contracts

These types are the **API boundary between agents**. Any change must be agreed by both producer and consumer. They live in `packages/core/src/types.ts` (owned by Core agent) and are re-exported by every other package.

```typescript
// packages/core/src/types.ts

export type ZGChain = '0g-galileo-testnet' | '0g-aristotle';

export interface INFTRef {
  contractAddress: `0x${string}`;
  tokenId: bigint;
  chain: ZGChain;
}

export interface SkillManifest {
  hash: `0x${string}`;          // 0G Storage content hash
  capabilityTag: string;        // e.g., "fetch.arxiv"
  schemaIn: object;             // JSON Schema for input
  schemaOut: object;            // JSON Schema for output
  priceUSDC: number;            // x402 paywall price
  ownerINFT: INFTRef;
}

export interface AgentData {
  intelligenceHash: `0x${string}`;   // 0G Storage pointer (encrypted blob)
  skillManifestHash: `0x${string}`;  // 0G Storage pointer (skill list)
  memoryRootHash: `0x${string}`;     // 0G KV root for current state
  royaltyVault: `0x${string}`;       // RoyaltyVault contract address
  evolvedAt: number;                 // unix seconds
}

export interface ExecutionIntent {
  kind: 'contractCall' | 'erc20Transfer' | 'nativeTransfer' | 'multistep';
  chain: ZGChain;          // Clawforger is 0G-only — no second chain
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
  abi?: object;
  functionName?: string;
  args?: unknown[];
}

export interface TxResult {
  ok: boolean;
  txHash?: `0x${string}`;
  blockNumber?: bigint;
  gasUsed?: bigint;
  retries: number;
  workflowRunId: string;          // KeeperHub run id
  error?: string;
}

export interface Memory {
  kvGet(key: string): Promise<unknown | null>;
  kvSet(key: string, value: unknown): Promise<void>;
  logAppend(entry: { kind: string; data: unknown; ts: number }): Promise<`0x${string}`>;
  logRead(opts: { from?: number; to?: number }): Promise<unknown[]>;
}

export interface Inference {
  generate(opts: { prompt: string; system?: string; maxTokens?: number }): Promise<string>;
  generateCode(opts: { task: Task; existingSkills: SkillManifest[]; style: 'typescript-bun-isolate' }): Promise<string>;
}

export interface Executor {
  execute(intent: ExecutionIntent): Promise<TxResult>;
}

export interface Task {
  id: string;
  description: string;
  inputs: Record<string, unknown>;
  successCriteria: SuccessCriteria;
}

export type SuccessCriteria =
  | { kind: 'jsonSchemaMatch'; schema: object }
  | { kind: 'stringContains'; s: string }
  | { kind: 'lambda'; fn: (output: unknown) => boolean };
```

## Shared addresses file

Once contracts deploy on Day 1, the Contracts agent writes:

```json
// addresses.json (committed at repo root) — 0G-only deployment
{
  "chains": {
    "0g-galileo-testnet": {
      "ClawforgerINFT": "0x...",
      "SkillRegistry": "0x...",
      "RoyaltyVaultTemplate": "0x...",
      "mUSDC": "0x..."          // we deploy our own mock USDC ERC-20 on 0G
    }
  },
  "x402": {
    "facilitatorUrl": "http://localhost:3701",  // self-hosted, see AGENT-EXECUTION.md
    "settlementChain": "0g-galileo-testnet",
    "settlementAsset": "mUSDC"
  },
  "deployedAt": "2026-05-DD",
  "deployedBy": "0x..."
}
```

Every other agent reads from this file. **Do not hardcode addresses anywhere else.**

## Cross-agent communication protocol

When an agent is blocked by another, they:
1. Open a stub / mock so their own work continues
2. Write a one-line note in `BLOCKERS.md` (created at repo root) like:
   ```
   - [UI] needs SkillRegistry ABI — using mock at apps/studio/src/mocks/SkillRegistry.json
   ```
3. Continue their other work
4. Resolve the blocker when the upstream is ready, delete the line

There is no Slack, no standups. The blockers file is the standup.

## Definition of "done" per agent

| Agent | Done when |
|-------|-----------|
| Contracts | All 3 contracts deployed on testnet, ABIs exported to `packages/core/src/abis/`, `addresses.json` committed |
| Core | `bun examples/researcher` mints an iNFT, runs inference, persists memory to 0G, evolves a skill end-to-end |
| Execution | `bun examples/writer` pays Researcher's skill via x402, KeeperHub workflow logs visible, RoyaltyVault receives USDC |
| UI | Studio renders mint flow, agent detail, skill marketplace; live demo button runs the Researcher→Writer flow visibly |
| Demo | 3-min video recorded, FEEDBACK.md ≥ 800 words, README quickstart works on a fresh clone, submission text drafted for all 5 tracks |

When all 5 are done, the project is shippable.

## Anti-patterns (don't do these)

- **Don't read other agents' source code unless their `AGENT-*.md` says you should.** Coordinate via interfaces, not implementations.
- **Don't expand your own scope.** If you find yourself fixing UI from the Contracts terminal, stop — file a BLOCKERS.md note and let the UI agent handle it.
- **Don't change the shared types without notice.** A type change ripples to 4 other terminals. Discuss in `BLOCKERS.md` first.
- **Don't commit secrets.** `.env` is gitignored. Each agent has its own example env in their AGENT-*.md.

## Pointers to global context

Read these once before starting your slice:

- [README.md](README.md) — the elevator pitch
- [CONCEPT.md](CONCEPT.md) — full vision, demo script
- [ARCHITECTURE.md](ARCHITECTURE.md) — module breakdown, contracts, data flow
- [ROADMAP.md](ROADMAP.md) — day-by-day plan
- [WHY-WE-WIN.md](WHY-WE-WIN.md) — what each track judge is looking for
- [RESEARCH.md](RESEARCH.md) — 2026 meta context

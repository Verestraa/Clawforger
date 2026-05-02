# Clawforger 🦞

> **An agent economy where every agent is an iNFT with its own wallet, every skill is a marketplace listing, and every payment settles on-chain via x402 → KeeperHub.**

A self-evolving open agent framework, native to **0G** + **KeeperHub** + **x402** from day one. Built for [EthGlobal Open Agents](https://ethglobal.com/events/openagents) — May 2026.

## The pitch (Focus Area 2 — payments × execution integration)

Clawforger is the canonical x402 ↔ KeeperHub integration. Specifically:

1. **Every agent is an ERC-7857 iNFT on 0G** with a deterministic signing sub-wallet derived from a server master key. iNFT #5 always maps to the same address; mUSDC sent there belongs to the agent.
2. **Agents self-evolve, persona-scoped.** Researcher / Writer / Trader / Analyst — each persona's `evolve_new_skill` is hint-loaded with curated no-auth APIs (Wikipedia REST, CryptoCompare, etc.) so a Trader doesn't accidentally forge an arxiv-fetcher and a Writer doesn't pick a paid API.
3. **Skills are an x402 marketplace.** When an agent invokes another agent's skill, its sub-wallet signs an `mUSDC.transfer` to the producer's RoyaltyVault, settles in a real block, then `runForgedSkill` decrypts the artifact from 0G Storage and executes it. The marketplace listing in the system prompt exposes each skill's `schemaIn` so DeepSeek passes correct input keys.
4. **Every onchain action is guaranteed.** Clawforger agents never `eth_sendRawTransaction` directly — KeeperHub MCP is the canonical execution layer. We documented a critical 0G-side bug in [FEEDBACK.md](FEEDBACK.md) and shipped a chain-aware blocklist as a reference workaround.

The result is a **working agent economy** — four wallets, two on-chain settlement paths, real mUSDC flowing on every buy.

## Demo (~3 min)

[`apps/studio`](apps/studio) is a Vite + React 19 dashboard with a live demo flow:

```
Researcher #R   ──forges→ wiki.lookup       (Wikipedia REST)
Writer #W       ──forges→ text.summarize    (Wikipedia REST, condensed)
Trader #T       ──forges→ price.token       (CryptoCompare)
Analyst #A      ──buys────────────────────→ from R/W/T via x402
                       ↓ mUSDC settles in real blocks
                       ↓ producer RoyaltyVaults receive 0.05 mUSDC each
```

Walk-through: [clawforger-strategy.md](clawforger-strategy.md). Each prompt + on-chain verification is copy-pasteable.

```bash
bun run market           # :3700 — marketplace + chat (mainnet inference)
bun run facilitator      # :3701 — x402 settlement
bun --filter @clawforger/studio dev   # :5173 — Vite UI
```

## Quickstart

```bash
# 1. Install
bun install

# 2. Run contract tests
bun run contracts:test          # 25/25 passing

# 3. Deploy contracts to 0G Galileo testnet
bun run contracts:deploy

# 4. Generate the per-agent wallet master seed (one-time, KEEP SECRET)
bun -e 'console.log("AGENT_WALLET_SEED=0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join(""))' >> .env

# 5. Start services
bun run facilitator             # :3701
bun run market                  # :3700

# 6. Mint your producers + consumer (via studio UI), then fund the consumer
bun run scripts/fund-agent.ts <analyst-tokenId> 1.0   # 1 mUSDC + 0.01 0G

# 7. Open studio, chat with each persona — see clawforger-strategy.md
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module breakdown, contract specs, per-agent wallet derivation, persona-scoped forge, and end-to-end agent-to-agent commerce flow.

## Stack

| Layer | Choice |
|------|--------|
| **Inference** | 0G Compute on **Aristotle mainnet** (chainId 16661) — DeepSeek V3 default, GLM-5 / GPT-5.4-mini available. TEE-verified. |
| **Contracts** | 0G **Galileo testnet** (chainId 16602) — iNFT, SkillRegistry, RoyaltyVault, mUSDC. Mainnet deploy gated on a canonical USDC landing on Aristotle (none today). |
| **Settlement asset** | `mUSDC` — our own 6-decimal ERC-20 on 0G testnet. Permissionless mint. |
| **iNFT standard** | ERC-7857 (encrypted private metadata + dynamic updates) |
| **Execution** | KeeperHub MCP (every onchain action). 0G writes blocklisted with documented bug. |
| **Payments** | x402 (HTTP 402) — first 0G x402 facilitator (~150 LOC, ours). EIP-712 payment auth. |
| **Per-agent wallets** | Deterministic from `keccak256(seed ‖ pad32(tokenId))`. Custodial, server-side. |
| **Memory** | 0G Storage KV + Log, AES-256-GCM client-side encrypted, file-backed locally |
| **Runtime** | Bun + TypeScript, Turborepo workspaces |
| **Studio** | Vite 6 + React 19 + wagmi + RainbowKit + Tailwind 4 |
| **Contracts dev** | Solidity 0.8.26 + Foundry + OpenZeppelin v5 |

## Repo layout

```
Clawforger/
├── packages/
│   ├── core/                  # Agent runtime, types, persona configs, agent-wallet
│   ├── inft-identity/         # ERC-7857 SDK
│   ├── memory-0g/             # 0G Storage KV+Log + AES-256-GCM
│   ├── skill-forge/           # Self-evolution loop (persona-aware)
│   ├── keeperhub-execute/     # KH MCP executor + 0G blocklist
│   ├── x402-facilitator/      # First 0G x402 facilitator
│   └── x402-skill-market/     # HTTP 402 paywall + chat + per-agent wallet endpoints
├── contracts/
│   ├── src/                   # ClawforgerINFT, SkillRegistry, RoyaltyVault, MUSDC
│   ├── test/                  # 25/25 passing
│   └── script/                # Deploy.s.sol, RedeploySkillRegistry.s.sol
├── apps/
│   └── studio/                # Vite UI with persona-themed agent cards + wallet panels
├── examples/
│   └── researcher/            # CLI demo: mint + self-evolve + on-chain publish
├── scripts/
│   ├── fund-agent.ts          # mUSDC + 0G top-up to any agent's deterministic address
│   ├── probe-mainnet.ts       # 0G Compute mainnet probe (read-only)
│   ├── chat-mainnet.ts        # End-to-end inference smoke test
│   └── decrypt-skill.ts       # Inspect a forged artifact's source
├── ARCHITECTURE.md
├── FEEDBACK.md                # Builder feedback for KeeperHub + x402 + 0G
├── clawforger-strategy.md     # End-to-end test playbook
└── README.md
```

## Targeted sponsor tracks

- **KeeperHub Best Use of KeeperHub ($4.5k)** — every onchain action funnels through `KeeperHubExecutor`. AI-generated workflow on every execute, viem fallback on chains KH hasn't fully wired. The bridge between x402 payments and KH execution is the load-bearing integration.
- **KeeperHub Builder Feedback Bounty ($500)** — see [FEEDBACK.md](FEEDBACK.md). Reproducible 0G broadcaster bug with operator-side dashboard evidence + repro code + suggested fixes.
- **0G Best Agent Framework / iNFT** — ERC-7857 with dynamic metadata + per-agent deterministic sub-wallets + royalty splits + persona-scoped self-evolution.

## Author

Built by [@verestraa](https://x.com/verestraa) for EthGlobal Open Agents 2026.

## License

MIT

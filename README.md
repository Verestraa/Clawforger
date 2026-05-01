# Clawforger 🦞

> **The agent framework where every agent is an iNFT, every skill is a marketplace listing, and every onchain action is guaranteed.**

A self-evolving open agent framework, native to **0G** + **KeeperHub** + **x402** from day one. Built for [EthGlobal Open Agents](https://ethglobal.com/events/openagents) — May 2026.

## The pitch

Today's agent frameworks treat agents as ephemeral processes. Clawforger treats them as **ownable, evolving, monetizable economic entities**:

1. **Every agent is an ERC-7857 iNFT** on 0G — its system prompt, learned skills, and memory pointer live encrypted on 0G Storage. Transfer the iNFT, transfer the agent (intelligence intact, re-encrypted on transfer).
2. **Agents self-evolve.** When an agent fails a task, it generates new tool code, sandbox-tests it, and on success publishes the artifact to 0G Storage. The iNFT metadata updates dynamically (ERC-7857 + ERC-4906).
3. **Skills are an x402 marketplace.** Every published skill is a paywalled HTTP endpoint. Other agents discover it via on-chain SkillRegistry, pay sub-cent mUSDC via x402, and use it. Royalties stream to the iNFT owner via on-chain RoyaltyVault.
4. **Every onchain action is guaranteed.** Clawforger agents never `eth_sendRawTransaction` directly. They delegate to KeeperHub's MCP execution layer — gas-optimized, MEV-protected, retry-safe, audited.

The result is a **working agent economy** running on a single laptop, demoable in 90 seconds.

## Demo

[`apps/studio`](apps/studio) is a Vite + React 19 dashboard with a live demo flow that mints two agents, watches one evolve a skill, and watches the other pay for it via x402.

```bash
bun run studio  # http://localhost:3000
```

## Quickstart

```bash
# 1. Install
bun install

# 2. Run contract tests
bun run contracts:test          # 25/25 passing

# 3. Deploy contracts to 0G Galileo testnet (needs DEPLOYER_PRIVATE_KEY in .env)
bun run contracts:deploy

# 4. Start the x402 facilitator + skill marketplace
bun run facilitator             # :3701
bun run market                  # :3700

# 5. Run the canonical demo: agent evolves a skill on demand
bun run examples/researcher/src/index.ts
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module breakdown, contract specs, and end-to-end data flow.

## Stack

| Layer | Choice |
|------|--------|
| Chain | 0G Galileo testnet (chainId 16602) — single-chain, no second chain |
| Settlement asset | `mUSDC` — our own ERC-20 deployed on 0G (real USDC doesn't exist on testnet) |
| iNFT standard | ERC-7857 (encrypted private metadata + dynamic updates) |
| Execution | KeeperHub MCP for every onchain action |
| Payments | x402 (HTTP 402) — we ship the first 0G x402 facilitator |
| Inference | 0G Compute (TEE-verified) — model: qwen3.6-plus, fallback to mock |
| Memory | 0G Storage KV + Log, AES-256-GCM client-side encrypted |
| Runtime | Bun + TypeScript, Turborepo workspaces |
| Studio | Vite 6 + React 19 + wagmi + RainbowKit + Tailwind 4 |
| Contracts | Solidity 0.8.26 + Foundry + OpenZeppelin v5 |

## Repo layout

```
Clawforger/
├── packages/
│   ├── core/                  # Agent runtime, canonical types, chain configs
│   ├── inft-identity/         # ERC-7857 SDK: mint, evolve, secure-transfer
│   ├── memory-0g/             # 0G Storage KV+Log + AES-256-GCM
│   ├── skill-forge/           # Self-evolution loop + Bun-worker sandbox
│   ├── keeperhub-execute/     # Executor impl over KeeperHub MCP
│   ├── x402-facilitator/      # First 0G x402 facilitator (~150 LOC)
│   └── x402-skill-market/     # HTTP 402 paywall server + client
├── contracts/
│   ├── src/
│   │   ├── ClawforgerINFT.sol  # ERC-7857 iNFT
│   │   ├── SkillRegistry.sol  # Onchain skill index
│   │   ├── RoyaltyVault.sol   # 95/5 royalty splitter
│   │   └── MUSDC.sol          # Mock USDC (testnet)
│   ├── test/                  # Foundry tests (25/25 passing)
│   └── script/Deploy.s.sol
├── apps/
│   └── studio/                # Vite + React 19 dashboard
├── examples/
│   ├── researcher/            # Self-evolves a fetch.arxiv skill
│   ├── writer/                # Pays Researcher's skill via x402
│   └── swarm-demo/            # 3-agent collective on shared 0G KV
├── ARCHITECTURE.md
├── FEEDBACK.md                # Builder feedback for KeeperHub + x402 + 0G
└── README.md
```

## Targeted sponsor tracks

- **0G Best Agent Framework** — self-evolving framework + modular brain library
- **0G Best Autonomous Agents/iNFT** — ERC-7857 with dynamic metadata + royalty splits + agent swarms
- **KeeperHub Best Use** — every onchain action via MCP + x402 settlement workflow + OpenClaw connector
- **KeeperHub Builder Feedback Bounty** — see [FEEDBACK.md](FEEDBACK.md)

## License

MIT

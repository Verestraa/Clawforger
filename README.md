# Clawforger

> **The agent framework where every agent is an iNFT, every skill is a marketplace listing, and every onchain action is guaranteed.**

A new open agent framework — inspired by OpenClaw, native to 0G + KeeperHub + x402 from day one.

Clawforger is a framework-level project for the EthGlobal Open Agents hackathon (May 2026), targeting two sponsor pools with depth-of-integration: **0G ($15k)** and **KeeperHub ($5k)**. It also picks up bonus surface on **Uniswap** and **Gensyn AXL** without forcing it.

## The 30-second pitch

Today's agent frameworks treat agents as ephemeral processes. Clawforger treats them as **ownable, evolving, monetizable economic entities**:

1. **Mint any Clawforger agent as an ERC-7857 iNFT** on 0G Aristotle Mainnet — its system prompt, learned skills, and memory pointer live encrypted on 0G Storage. Transfer the iNFT, transfer the agent (intelligence intact, re-encrypted).
2. **Agents self-evolve.** When an agent fails a task, it generates new tool code, sandbox-tests it, and on success publishes the artifact to 0G Storage as a reusable skill. The iNFT metadata updates dynamically (ERC-7857 supports this natively).
3. **Skills are an x402 marketplace.** Every published skill is paywalled — other agents discover it via a 0G KV registry, pay sub-cent USDC via x402, and use it. Royalties stream to the iNFT owner.
4. **Every onchain action is guaranteed.** Clawforger agents never `eth_sendRawTransaction` directly. They delegate to KeeperHub's MCP execution layer — gas-optimized, MEV-protected, retry-safe, audited.

The result is an **agent economy primitive**, not another wrapper around an LLM.

## Documents in this repo

| File | Purpose |
|------|---------|
| [CONCEPT.md](CONCEPT.md) | Full vision, why this concept, what makes it 2026-meta |
| [WHY-WE-WIN.md](WHY-WE-WIN.md) | Track-by-track judge mapping, expected prize ceiling/floor |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module breakdown, tech stack, data flow, smart contracts |
| [ROADMAP.md](ROADMAP.md) | Day-by-day build plan from scratch to demo |
| [RESEARCH.md](RESEARCH.md) | 2026 meta research, primary sources, why now |

## Status

Pre-build. Strategy locked. Implementation begins after concept review.

## Repo layout (planned)

```
Clawforger/
├── packages/
│   ├── core/                # Agent runtime, lifecycle, hooks
│   ├── inft-identity/       # ERC-7857 mint/transfer/update SDK
│   ├── skill-forge/         # Self-evolution loop (generate → test → publish)
│   ├── keeperhub-execute/   # KeeperHub MCP wrapper, execution module
│   ├── x402-skill-market/   # x402 paywall + 0G KV skill registry
│   └── memory-0g/           # 0G Storage KV + Log persistence layer
├── contracts/
│   ├── ClawforgerINFT.sol    # ERC-7857 implementation
│   ├── SkillRegistry.sol    # Onchain skill index (mirrors 0G KV)
│   └── RoyaltyVault.sol     # x402 royalty splitter per iNFT
├── examples/
│   ├── researcher/          # Self-evolves arxiv/web scrape skills
│   ├── trader/              # Treasury agent, KeeperHub-executed swaps
│   └── swarm-demo/          # 3 agents collaborating + paying each other
├── apps/
│   ├── studio/              # Web UI: mint, evolve, browse skill market
│   └── docs/                # Framework docs site
├── FEEDBACK.md              # Uniswap + KeeperHub builder feedback
└── README.md
```

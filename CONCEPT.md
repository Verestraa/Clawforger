# Concept

## Thesis

By May 2026, the agent stack has consolidated around three primitives:

1. **MCP** for agent ↔ tool calls
2. **A2A** for agent ↔ agent calls
3. **x402** for agent ↔ value calls

…and one ownership model: **iNFTs (ERC-7857)** for agents themselves. NVIDIA, OpenAI, AWS, Google, Microsoft, and Coinbase are all publicly aligned on agentic-economy framing in Q1–Q2 2026, with Jensen Huang sizing the agentic AI opportunity at $1T at GTC 2026 and McKinsey projecting $3–5T of mediated commerce by 2030.

What's *missing* in the open-source stack is a framework that **assumes** all four primitives from day one and binds them into a coherent runtime. OpenClaw is messaging-channel-first; LangChain is tool-first; CrewAI is role-first. None of them are *economy-first*.

Clawforger is economy-first.

## Core idea

An agent in Clawforger is **not a process** — it's an **iNFT with an executor attached**.

| Layer | Mechanism | What it gives the agent |
|------|-----------|-------------------------|
| Identity | ERC-7857 iNFT on 0G Chain | Ownership, transferability, royalties, dynamic state |
| Intelligence | Encrypted blob on 0G Storage (system prompt + learned skills) | Persistent, re-encryptable on transfer, private |
| Memory | 0G KV (real-time state) + 0G Log (history) | Cross-session learning, verifiable timeline |
| Reasoning | 0G Compute TEE inference | Verifiable, sealed model calls |
| Skills | Code artifacts on 0G Storage, indexed by 0G KV registry | Composable, discoverable, monetizable |
| Action | KeeperHub MCP execution layer | Reliable onchain settlement, gas-optimized, MEV-safe |
| Payments | x402 paywalled skill endpoints | Sub-cent micropayments, no API keys |
| (Bonus) Discovery | Gensyn AXL for P2P agent mesh | Decentralized agent discovery |
| (Bonus) Treasury | Uniswap auto-rebalance via KeeperHub workflows | Self-sustaining agent finances |

## The self-evolution loop

This is the headline feature and demo centerpiece:

```
1. Agent receives task it cannot solve with current skills
2. LLM (via 0G Compute, sealed inference) generates candidate tool code
3. Sandbox executes candidate against task's success criteria
4. On success → upload artifact to 0G Storage, index in 0G KV
                + register paywalled endpoint via x402
                + ERC-7857 metadata update (new skill manifest hash)
5. Skill is now (a) callable by self forever, (b) discoverable + payable by other agents
```

Everything in step 4 is **on-chain or content-addressed** — judges can verify the new skill exists by reading 0G Storage and the iNFT's updated metadata URI.

When **another agent** uses your skill:
- They look it up in the 0G KV registry
- Hit the x402-gated endpoint with a USDC micropayment
- Skill execution routes through KeeperHub MCP for any onchain side effects
- 5%/95% royalty split (protocol/owner) settles to the iNFT owner's address via on-chain RoyaltyVault

This is a **functioning agent economy** running on a single laptop, demoable in 90 seconds.

## Why this concept wins (vs. the obvious alternatives)

| Alt concept | Why it loses |
|-------------|--------------|
| Personal Digital Twin | Solves a single user's problem; no economy, no composability story; iNFT angle feels bolted on; AIverse already shipped this |
| Research swarm | Crowded category (10+ similar submissions expected); AXL/A2A is the headline, KeeperHub is decorative; no x402 or iNFT story |
| iNFT breeding/arena | Cute, but a toy; KeeperHub has no role; x402 has no role; can't be pitched to enterprise judges |
| Yet another agent framework with 0G memory | Framework track is crowded; "memory module" is incremental; doesn't differentiate against EvoAgentX, Hermes, OpenSpace |
| Clawforger | Hits all 4 primitives natively, ships a demo agent economy, frames every track sponsor as load-bearing not decorative |

## What makes it 2026-meta (not 2024-meta)

- **Self-evolving agents** — the dominant 2026 architecture (EvoAgentX, OpenSpace, Hermes 95k stars). Clawforger is the first to bind self-evolution to **monetizable iNFT identity**.
- **iNFT-native** — ERC-7857 only became real with 0G Aristotle Mainnet (Sept 2025) and AIverse (March 2026). Most submissions will still be ERC-721 wrappers. We use iNFT *dynamic metadata* and *secure re-encryption on transfer* — the actually-novel parts.
- **x402-native** — the x402 Foundation formed in April 2026 with Google/AWS/Microsoft. Skill-marketplace-via-x402 is the canonical agentic-commerce demo and almost no hackathon submissions will have real x402 flows.
- **KeeperHub as default executor** — most projects bolt KeeperHub on as one of N tools. We make it the *only* onchain execution path. Depth-of-integration scoring is binary: shallow loses.

## The killer demo (3 minutes)

1. **0:00–0:30** — Mint two iNFT agents: "Researcher" and "Writer." Show the iNFT on 0G explorer, encrypted intelligence on 0G Storage.
2. **0:30–1:30** — Give Researcher a task it cannot do (e.g., "summarize the latest arxiv paper on DSPy"). Watch it generate a `fetch_arxiv` skill, sandbox-test it, publish to 0G Storage, register x402 endpoint, update its iNFT metadata. The studio UI shows skill artifact appear in market with price `0.05 USDC`.
3. **1:30–2:30** — Give Writer the same task. Writer's reasoning surfaces "I don't have arxiv access" → searches 0G KV registry → finds Researcher's skill → pays 0.05 USDC via x402 → calls the skill → completes the task. RoyaltyVault shows USDC arriving at Researcher's iNFT owner address.
4. **2:30–3:00** — Show KeeperHub dashboard: every onchain tx (mint, metadata update, royalty payout) routed through KeeperHub MCP with retry counts, gas savings vs baseline.

This demo simultaneously shows iNFT, self-evolution, x402, agent-to-agent payment, KeeperHub execution, and 0G Storage/Compute. **Six sponsor primitives, one continuous narrative.**

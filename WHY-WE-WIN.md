# Why We Win — Track-by-Track Judge Mapping

A judge isn't reading our README cover-to-cover. They have 5 minutes per submission, a rubric, and a spreadsheet. This document maps every line of every rubric to a concrete deliverable.

## 0G — $15,000 (split into two $7,500 sub-pools)

### Sub-pool 1: Best Agent Framework, Tooling & Core Extensions ($7,500, ranked)

> *Framework-level work. New open agent frameworks inspired by OpenClaw (or alternatives like ZeroClaw, NullClaw, etc.) and deployed on 0G.*

| Rubric line | Clawforger deliverable |
|-------------|----------------------|
| "New OpenClaw modules for hierarchical planning, reflection loops, or multi-modal reasoning that natively integrate 0G Compute's sealed inference" | `@clawforger/skill-forge` is a reflection-loop module. All inference goes through 0G Compute broker (qwen3.6-plus / GLM-5-FP8). |
| "Self-evolving agent framework that autonomously generates/tests/integrates new skills/tools using persistent 0G Storage memory" | **This is literally our headline feature.** Skills are generated, sandbox-tested, persisted to 0G Storage, indexed in 0G KV. |
| "Modular 'agent brain' library with easy swapping of memory layers (0G Storage KV/Log), LLM backends, or decision engines" | `@clawforger/core` exposes pluggable `Memory`, `Inference`, and `Executor` interfaces. Three reference adapters ship for 0G Storage, 0G Compute, KeeperHub. |
| "At least one working example agent built using your framework/tooling" | `examples/researcher` + `examples/writer` + `examples/swarm-demo` |
| "Architecture diagram showing integration with OpenClaw + 0G Storage/Compute" | `ARCHITECTURE.md` includes ASCII + Mermaid diagrams |

**Ceiling:** 1st place ($2,500). **Floor:** 4th–5th ($500–$1,000). The "self-evolving" angle is the explicit example call-out in the prize description; nailing it is the highest-leverage move available.

### Sub-pool 2: Best Autonomous Agents, Swarms & iNFT Innovations ($7,500, up to 5 × $1,500)

> *Long-running goal-driven agents, emergent collaboration, novel uses of iNFTs (ERC-7857) for ownership, composability, and monetization.*

| Rubric line | Clawforger deliverable |
|-------------|----------------------|
| "iNFT-minted agents with embedded intelligence (encrypted on 0G Storage), persistent memory, dynamic upgrades, and automatic royalty splits on usage" | **All four. Embedded intelligence via encrypted 0G Storage blob. Dynamic upgrades via ERC-7857 metadata update on each evolution. Royalty splits via on-chain RoyaltyVault triggered by x402 payments.** |
| "Specialist agent swarms (planner + researcher + critic + executor) that collaborate in real time via shared 0G Storage memory and coordinate inference on 0G Compute" | `examples/swarm-demo` ships exactly this 4-role swarm with shared 0G KV memory. |
| "Agent breeding/merging via iNFTs, emergent behavior experiments, agent arenas, or completely new paradigms leveraging 0G's full stack" | Skill marketplace + royalty economy = a "new paradigm" we can articulate cleanly. |
| "For iNFT projects: link to the minted iNFT on 0G explorer + proof that the intelligence/memory is embedded" | We ship a deployed iNFT contract on 0G Aristotle Mainnet with at least 3 minted example agents, each with verifiable encrypted intelligence pointer. |

**Ceiling:** $1,500 (top tier). **Floor:** $0 if iNFT angle isn't compelling enough vs other entries. Mitigation: the *royalty-on-skill-usage* mechanic is the differentiator — it's a working agent economy, not a static collectible.

**Combined 0G expected value:** $2,000–$4,000.

---

## KeeperHub — $5,000 (Best Use, ranked) + $500 Feedback Bounty

> *Two focus areas, one ranked prize pool. Best work wins regardless of which area you build in.*

### Focus Area 1: Innovative Use of KeeperHub

| Rubric line | Clawforger deliverable |
|-------------|----------------------|
| "Use KeeperHub's execution layer in a way that solves a real problem" | **Real problem:** self-evolving agents generate code that calls onchain — naive `eth_sendRawTransaction` from generated code is unsafe and unreliable. Clawforger **mandates** KeeperHub MCP as the executor for *any* onchain action, providing retry, gas optimization, and audit trail for unpredictable agent-generated transactions. |
| "Real utility over novelty" | RoyaltyVault payouts on every skill usage are real money flowing through KeeperHub — not a demo button. |
| "Depth of KeeperHub integration" | KeeperHub is **load-bearing**, not optional. Removing it breaks the framework's reliability guarantees. We expose `clawforger.execute()` which compiles agent intent → KeeperHub workflow → MCP submit, then polls for completion. |

### Focus Area 2: Integration with KeeperHub

| Rubric line | Clawforger deliverable |
|-------------|----------------------|
| "Agent frameworks and tools. Build a plugin, connector, or SDK integration for ElizaOS, OpenClaw, LangChain, CrewAI, or any framework with an active builder community" | `@clawforger/keeperhub-execute` is the connector. We also ship a thin **OpenClaw plugin** (`openclaw-plugin-keeperhub`) so existing OpenClaw users get reliable execution by adding 5 lines of config. **Two integrations from one repo.** |
| "Payments. Integrate KeeperHub with payment rails like x402 or MPP" | `@clawforger/x402-skill-market` routes x402 receipts through KeeperHub workflow execution — KeeperHub becomes the **settlement layer** for skill-marketplace payments. This is the explicit "x402 + KeeperHub" combo the rubric asks for. |

### Judging criteria self-scoring

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Does it work? | ✅ | Working demo with live mint, evolve, pay, settle |
| Would someone actually use it? | ✅ | OpenClaw plugin is shippable to OpenClaw's user base post-hackathon |
| Real utility over novelty | ✅ | Solves the "agent-generated code is risky onchain" problem |
| Depth of KeeperHub integration | ✅ | Mandatory executor + payment settlement (two integration surfaces) |
| Mergeable quality | ✅ | Clean monorepo, typed packages, examples, docs site |

**Ceiling:** 1st place ($2,500). **Floor:** 3rd ($500). Plus we're a strong candidate for the $250 Feedback Bounty — every hour of build pain becomes a FEEDBACK.md line item.

**Expected KeeperHub value:** $1,500–$2,750.

---

## ENS — $5,000 (two $2,500 categories)

We don't target ENS as a primary track, but we get it nearly for free:

- Each iNFT mint auto-claims a subname like `agent-0042.clawforger.eth` (CCIP-Read resolver, no per-mint gas)
- The subname's `text` records mirror the iNFT metadata: personality, skill manifest hash, royalty address
- Other agents can discover skills via ENS reverse lookup → much friendlier than KV-only registry

This is ~1 day of work that could win 3rd place ($500) in either ENS sub-track.

**Expected ENS value:** $0–$500 (treat as bonus).

---

## Uniswap — $5,000

We don't make Uniswap load-bearing, but the framework needs treasuries somewhere:

- `examples/trader` is a Clawforger agent that uses KeeperHub workflows + Uniswap API to rebalance its USDC reserves
- FEEDBACK.md ships with real builder notes (the AgentPrisonerDillema FEEDBACK.md is already strong material)

3rd place ($1,000) is realistic if we surface the integration cleanly.

**Expected Uniswap value:** $0–$1,000 (treat as bonus).

---

## Gensyn AXL — $5,000

Optional. If we have spare time, AXL becomes the **transport layer** for the swarm-demo so the 4 agents talk peer-to-peer instead of through a shared backend (avoiding the AgentPrisonerDillema "centralized orchestrator" trap).

3rd place ($1,000) is the realistic target.

**Expected AXL value:** $0–$1,000 (treat as bonus).

---

## Total expected prize ranges

| Scenario | Total |
|----------|-------|
| **Pessimistic** (ship core only, win nothing) | $0 |
| **Realistic** (KeeperHub 2nd–3rd, 0G one mid-tier placement) | $2,500–$5,000 |
| **Strong** (KeeperHub 1st-2nd, 0G framework top-3, 0G iNFT placement) | $6,000–$8,500 |
| **Ceiling** (KeeperHub 1st, 0G framework 1st, 0G iNFT 1st, ENS bonus, Uniswap bonus) | $8,000–$10,000+ |

The realistic-to-strong scenarios already 2–4× the AgentPrisonerDillema ceiling, with a concept that doesn't fight the rubric.

## What would make us lose

Honest pre-mortem so we can defend each:

1. **"You didn't really build a framework, you built a demo."** Counter: we ship as `npm install @clawforger/core` with documented APIs, types, and an OpenClaw plugin. Frameworks are judged by whether someone else could build with them; we make that path explicit.
2. **"Self-evolving is just `eval(llm_output)` in a box."** Counter: skills are sandboxed (Bun isolated runtimes or wasm), schema-validated, and tested against task success criteria *before* publish. Failures don't reach the registry.
3. **"x402 marketplace is a wrapper around USDC transfers."** Counter: we use the actual x402 specification with HTTP 402 paywall responses on real endpoints. Payment receipts are verified on-chain. Royalty splits are on-chain, not application-layer.
4. **"KeeperHub is just one of several executors you could swap in."** Counter: it's the default and only reference executor we ship. The interface exists for the framework to be extensible later — but the demo, docs, and examples all run KeeperHub.
5. **"iNFT update on every evolution is gas-expensive."** Counter: ERC-7857 metadata-update is a single 32-byte hash write per evolution; batched in a KeeperHub workflow it costs cents on 0G Aristotle. Acknowledge this in the docs and offer a "lazy update" mode for high-frequency evolution.

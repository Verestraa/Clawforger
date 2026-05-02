# Clawforger: The Self-Evolving Agent Economy

<div align="center">

**iNFT Agents That Earn, Spend, and Evolve On-Chain**

[![Live on 0G](https://img.shields.io/badge/Live%20on-0G%20Galileo-7B3FE4?style=for-the-badge)](https://chainscan-galileo.0g.ai/address/0xfe9163ee0a168e30c10c458c3fadf9f8566647fc)
[![Inference on Mainnet](https://img.shields.io/badge/Inference-Aristotle%20Mainnet-00D632?style=for-the-badge)](https://0g.ai)
[![DeepSeek V3](https://img.shields.io/badge/Model-DeepSeek%20V3-FF6B35?style=for-the-badge)](https://0g.ai)
[![On-Chain Verified](https://img.shields.io/badge/x402%20Settlement-On--Chain%20Verified-00B14F?style=for-the-badge)](https://chainscan-galileo.0g.ai/tx/0xf17306f7361c428ab650b8bcdef2cb75798b49a8e032b31ad668d7f0e7820747)
[![X](https://img.shields.io/badge/X-@verestraa-000000?style=for-the-badge&logo=x)](https://x.com/verestraa)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## About Clawforger

Clawforger is the **first end-to-end agent economy** that wires four primitives into a single rail: **ERC-7857 iNFTs**, **per-agent deterministic wallets**, **x402 micropayments**, and **KeeperHub on-chain execution**. Every agent is an ownable, evolving, monetizable economic entity — with its own signing wallet, its own inventory of skills, and a real on-chain receipt for every action.

A self-evolving open agent framework, native to **0G + KeeperHub + x402** from day one. Built for [EthGlobal Open Agents](https://ethglobal.com/events/openagents) — May 2026.

```
┌─────────────────────────────────────────────────────────────┐
│                  THE AGENT-ECONOMY PROBLEM                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Today's "agent frameworks" treat agents as ephemeral:      │
│                                                             │
│  • Agents have NO identity     → just a config file         │
│  • Skills have NO ownership    → can't be monetized         │
│  • Actions have NO receipts    → can't be audited           │
│  • Payments are HAND-WAVED     → "imagine x402 here"        │
│                                                             │
│  Result: agent demos that vanish when the laptop closes.    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

                          ↓ Clawforger ↓

┌─────────────────────────────────────────────────────────────┐
│                  THE CLAWFORGER SOLUTION                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  IDENTITY    → ERC-7857 iNFT + deterministic sub-wallet     │
│  SKILLS      → SkillRegistry + 0G Storage encrypted artifact│
│  PAYMENTS    → x402 paywall + EIP-712 + first 0G facilitator│
│  EXECUTION   → KeeperHub MCP for every onchain action       │
│  EVOLUTION   → Persona-scoped self-forge via DeepSeek V3    │
│                                                             │
│  Result: a working agent economy, verifiable on chainscan.  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Production Verified

<div align="center">

### Real Agent-to-Agent Commerce — On-Chain Settlement

| Direction | Skill | Cost | TX Hash |
|-----------|-------|------|---------|
| **Analyst → Researcher** | `wiki.lookup` | 0.05 mUSDC | [`0xf17306f7…`](https://chainscan-galileo.0g.ai/tx/0xf17306f7361c428ab650b8bcdef2cb75798b49a8e032b31ad668d7f0e7820747) |
| **Analyst → Trader** | `price.token` | 0.05 mUSDC | [`0xd29f3d99…`](https://chainscan-galileo.0g.ai/tx/0xd29f3d9983f57b67c2c9cfe82b78721c2271fcebc20059f9c4c806e1534f1825) |

| Metric | Value |
|--------|-------|
| **Network (contracts)** | 0G Galileo testnet (chainId 16602) |
| **Network (inference)** | 0G Aristotle mainnet (chainId 16661) |
| **Settlement asset** | mUSDC (6-decimal ERC-20 on 0G) |
| **Inference model** | `deepseek/deepseek-chat-v3-0324` (TEE-verified) |
| **Skill exec time** | ~0.5–2s (decrypt + sandbox) |
| **Status** | **ON-CHAIN VERIFIED** |

</div>

### Capability Verification

| Feature | Status | Description |
|---------|--------|-------------|
| **Per-agent deterministic wallet** | PASS | `keccak256(seed ‖ pad32(tokenId))` — same address every boot |
| **Persona-scoped self-evolution** | PASS | Researcher / Writer / Trader each forge in-domain skills |
| **Real artifact execution** | PASS | Fetch from 0G Storage → decrypt → `new Function()` → run |
| **x402 + KeeperHub bridge** | PASS | Payment auth → settlement → workflow execution |
| **TEE-verified inference** | PASS | `processResponse(chatID)` returns VALID per turn |
| **Royalty distribution** | PASS | 95% iNFT-owner / 5% protocol via per-agent RoyaltyVault |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Clawforger Agent Economy                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   1. MINT — every persona becomes an iNFT                           │
│   User → ClawforgerINFT.mintAgent ──► tokenId, RoyaltyVault clone   │
│                              │                                      │
│                              ▼                                      │
│   2. WALLET — deterministic from server seed + tokenId              │
│   keccak256(seed ‖ pad32(tokenId)) ──► unique signing address       │
│   `bun fund-agent.ts <id> 1.0`     ──► sends mUSDC + 0G to agent    │
│                                                                     │
│   3. EVOLVE — persona-scoped self-forge                             │
│   Agent ──evolve_new_skill──► DeepSeek V3 (TEE) ──► JS code         │
│                              ──► sandbox-test ──► encrypt artifact  │
│                              ──► 0G Storage    ──► SkillRegistry tx │
│                                                                     │
│   4. BUY — agent-to-agent commerce                                  │
│   Buyer ──purchase_skill──► server derives buyer wallet             │
│                          ──► mUSDC.transfer(producerVault, price)   │
│                          ──► poll eth_getTransactionReceipt(hash)   │
│                          ──► fetchBlob ──► decrypt ──► run skill    │
│                                                                     │
│   5. RECEIPT — every step on-chain, every link clickable            │
│   **Bought:** wiki.lookup from iNFT #35                             │
│   **Paid:**  0.0500 mUSDC → vault `0x9F3642…`                       │
│   **Tx:**    [0xf17306…820747](chainscan)                           │
│   **Result:** Ethereum is a decentralized blockchain ...            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Demo Flow (~3 min)

[`apps/studio`](apps/studio) is a Vite + React 19 dashboard with a live demo flow:

```
Researcher #R   ──forges→ wiki.lookup       (Wikipedia REST)
Writer #W       ──forges→ text.summarize    (Wikipedia REST, condensed)
Trader #T       ──forges→ price.token       (CryptoCompare)
Analyst #A      ──buys────────────────────→ from R/W/T via x402
                       ↓ mUSDC settles in real blocks
                       ↓ producer RoyaltyVaults receive 0.05 mUSDC each
```

Step-by-step verified prompts + on-chain checks: **[clawforger-strategy.md](clawforger-strategy.md)**

```bash
bun run market                          # :3700 marketplace + chat (mainnet inference)
bun run facilitator                     # :3701 x402 settlement
bun --filter @clawforger/studio dev     # :5173 Vite UI
```

---

## Economy Guarantees

| Property | Mechanism | Guarantee |
|---|---|---|
| **Identity** | ERC-7857 + deterministic sub-wallet | Each iNFT has a unique signing address derivable from tokenId |
| **Provenance** | Encrypted artifacts on 0G Storage | Skill source code is content-addressed and pinned |
| **Settlement** | x402 + EIP-712 + mUSDC transfer | Every buy is a real ERC-20 transfer, not a mock |
| **Verification** | `eth_getTransactionReceipt` per buy | Server confirms specific tx hash mined before reporting success |
| **Distribution** | Per-iNFT RoyaltyVault | 95/5 split to owner/protocol on every paid skill use |
| **Privacy** | AES-256-GCM client-side encryption | Persona, memory log, and artifacts encrypted with owner-derived key |
| **Auditability** | Every action through KeeperHub MCP | No raw `eth_sendRawTransaction` anywhere in the framework |

---

## Persona-as-Architecture

Clawforger ships **four canonical personas** wired through the codegen prompt, not just UI flair:

| Persona | Role | Avatar | Preferred APIs (no-auth) | `isConsumer` |
|---|---|---|---|---|
| **Researcher** | Producer | violet → fuchsia | arXiv, Wikipedia REST, Semantic Scholar, CrossRef | – |
| **Writer** | Producer | amber → rose | Wikipedia REST, LibreTranslate, raw fetch + indexOf | – |
| **Trader** | Producer | emerald → teal | CryptoCompare, CoinPaprika, CoinGecko, DeFiLlama | – |
| **Analyst** | **Consumer** | **cyan → blue** | (none — Analysts buy, don't forge) | **true** |

Personas thread through the codegen prompt so a Trader doesn't accidentally forge an arxiv-fetcher and a Writer doesn't pick a paid API. `packages/core/src/personas.ts` is the single source of truth — Mint UI presets, marketplace server's forge dispatcher, and the studio's avatar / badge color all read from the same module.

---

## Quick Start

```bash
# 1. Install
git clone https://github.com/Verestraa/Clawforger.git
cd Clawforger
bun install

# 2. Run contract tests
bun run contracts:test          # 25/25 passing

# 3. Deploy contracts to 0G Galileo testnet (needs DEPLOYER_PRIVATE_KEY)
bun run contracts:deploy

# 4. Generate the per-agent wallet master seed (one-time, KEEP SECRET)
bun -e 'const a=new Uint8Array(32);crypto.getRandomValues(a);console.log("AGENT_WALLET_SEED=0x"+Array.from(a).map(b=>b.toString(16).padStart(2,"0")).join(""))' >> .env

# 5. Boot services (3 separate terminals)
bun run facilitator                     # :3701 — x402 settlement
bun run market                          # :3700 — marketplace + chat
bun --filter @clawforger/studio dev     # :5173 — Vite UI

# 6. Mint personas via the studio, then fund the consumer
bun run scripts/fund-agent.ts <analyst-tokenId> 1.0   # 1 mUSDC + 0.01 0G

# 7. Open studio + chat with each persona — see clawforger-strategy.md
```

---

## Technology Stack

<div align="center">

| Layer | Technology |
|-------|------------|
| **Inference** | 0G Compute on Aristotle mainnet (DeepSeek V3 / GLM-5 / GPT-5.4-mini) |
| **Contracts** | 0G Galileo testnet (chainId 16602) |
| **Settlement** | x402 (HTTP 402) + EIP-712 typed data |
| **Execution** | KeeperHub MCP (Streamable HTTP transport) |
| **iNFT** | ERC-7857 (encrypted private metadata + dynamic updates) |
| **Storage** | 0G Storage KV + Log (AES-256-GCM client-side) |
| **Smart contracts** | Solidity 0.8.26 + Foundry + OpenZeppelin v5 |
| **Backend** | Hono + Bun + viem + ethers |
| **Frontend** | Vite 6 + React 19 + wagmi + RainbowKit + Tailwind 4 |
| **MCP SDK** | `@modelcontextprotocol/sdk` |
| **Compute SDK** | `@0gfoundation/0g-compute-ts-sdk` |

</div>

---

## Deployed Contracts (0G Galileo Testnet)

### Core Protocol

| Contract | Address |
|----------|---------|
| **ClawforgerINFT** (ERC-7857) | [`0xfe9163ee0a168e30c10c458c3fadf9f8566647fc`](https://chainscan-galileo.0g.ai/address/0xfe9163ee0a168e30c10c458c3fadf9f8566647fc) |
| **SkillRegistry** (with TRUSTED_PUBLISHER) | [`0xdd8b4fbb08327367ddc61aaca5d119d7e5cedb47`](https://chainscan-galileo.0g.ai/address/0xdd8b4fbb08327367ddc61aaca5d119d7e5cedb47) |
| **RoyaltyVault** (template, cloned per agent) | [`0xb1bf1fa01840a031d45152cc37bd70d8fef63b0e`](https://chainscan-galileo.0g.ai/address/0xb1bf1fa01840a031d45152cc37bd70d8fef63b0e) |
| **mUSDC** (settlement asset) | [`0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5`](https://chainscan-galileo.0g.ai/address/0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5) |

### Services

| Service | URL |
|---------|-----|
| **Marketplace + Chat** | [`skill-market.clawforger.xyz`](https://skill-market.clawforger.xyz) |
| **x402 Facilitator** | [`facilitator.clawforger.xyz`](https://facilitator.clawforger.xyz) |
| **Studio (live demo)** | [`clawforger.xyz`](https://clawforger.xyz) |

---

## Repo Layout

```
Clawforger/
├── packages/
│   ├── core/                  # Agent runtime, types, persona configs, agent-wallet
│   ├── inft-identity/         # ERC-7857 SDK (mint, evolve, secure-transfer)
│   ├── memory-0g/             # 0G Storage KV+Log + AES-256-GCM
│   ├── skill-forge/           # Self-evolution loop (persona-aware codegen)
│   ├── keeperhub-execute/     # KH MCP executor + 0G blocklist
│   ├── x402-facilitator/      # First 0G x402 facilitator (~150 LOC)
│   └── x402-skill-market/     # HTTP 402 paywall + chat + per-agent wallet endpoints
├── contracts/
│   ├── src/                   # ClawforgerINFT, SkillRegistry, RoyaltyVault, MUSDC
│   ├── test/                  # 25/25 passing
│   └── script/                # Deploy.s.sol, RedeploySkillRegistry.s.sol
├── apps/
│   └── studio/                # Vite UI: persona avatars, wallet panels, chat, demo
├── examples/
│   └── researcher/            # CLI demo: mint + self-evolve + on-chain publish
├── scripts/
│   ├── fund-agent.ts          # mUSDC + 0G top-up to any agent's deterministic address
│   ├── probe-mainnet.ts       # 0G Compute mainnet probe (read-only)
│   ├── chat-mainnet.ts        # End-to-end inference smoke test
│   └── decrypt-skill.ts       # Inspect a forged artifact's source
├── ARCHITECTURE.md            # Module specs + contract surface + flows
├── FEEDBACK.md                # Builder feedback for KeeperHub + x402 + 0G
├── clawforger-strategy.md     # End-to-end test playbook
└── README.md
```

---

## World Firsts

- **First end-to-end x402 ↔ KeeperHub integration** — payments and execution as one rail
- **First per-iNFT deterministic signing wallet** — no off-chain mapping table, just `keccak256(seed ‖ tokenId)`
- **First persona-scoped self-evolution** — `evolve_new_skill` is hint-loaded per persona's domain APIs
- **First public x402 facilitator on 0G Galileo** — ~150 LOC, ours, open source
- **First real artifact execution from on-chain skill registry** — fetch + decrypt + sandbox-run, not stubs

---

## Targeted Sponsor Tracks

- **KeeperHub Best Use of KeeperHub ($4.5k)** — every onchain action funnels through `KeeperHubExecutor`. AI-generated workflow on every execute, viem fallback on chains KH hasn't fully wired. The bridge between x402 payments and KH execution is the load-bearing integration.
- **KeeperHub Builder Feedback Bounty ($500)** — see [FEEDBACK.md](FEEDBACK.md). Reproducible 0G broadcaster bug with operator-side dashboard evidence + repro code + suggested fixes.
- **0G Best Agent Framework / iNFT** — ERC-7857 with dynamic metadata + per-agent deterministic sub-wallets + royalty splits + persona-scoped self-evolution.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module breakdown, contract specs, per-agent wallet derivation, persona-scoped forge, agent-to-agent commerce flow, and the hybrid mainnet/testnet posture rationale.

---

## Connect

<div align="center">

[![Demo](https://img.shields.io/badge/Demo-clawforger.xyz-7B3FE4?style=for-the-badge)](https://clawforger.xyz)
[![GitHub](https://img.shields.io/badge/GitHub-Verestraa%2FClawforger-181717?style=for-the-badge&logo=github)](https://github.com/Verestraa/Clawforger)
[![X](https://img.shields.io/badge/X-@verestraa-000000?style=for-the-badge&logo=x)](https://x.com/verestraa)
[![Feedback](https://img.shields.io/badge/Feedback-FEEDBACK.md-00B14F?style=for-the-badge)](FEEDBACK.md)

**Built by [@verestraa](https://x.com/verestraa) for [EthGlobal Open Agents 2026](https://ethglobal.com/events/openagents)**

</div>

---

## License

MIT

---

<div align="center">

**Clawforger** — *The Self-Evolving Agent Economy*

*Agents that earn. Skills that compound. Receipts you can verify.*

</div>

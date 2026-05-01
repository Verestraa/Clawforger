# Roadmap — Build Plan from Scratch

Assumes a 7-day hackathon window with a solo or 2-person team. Optimized for **demoable end-to-end on day 5**, with days 6–7 reserved for polish, FEEDBACK.md depth, and the demo video.

## Day 0 — Setup (half-day)

- [ ] Provision 0G Galileo testnet wallet, fund with test 0G (single chain — Clawforger is all-in on 0G)
- [ ] Provision KeeperHub account, generate API key, install `kh` CLI, run `kh auth login`
- [ ] **Verify KeeperHub supports 0G Galileo (chainId 16602)** — file feature request and FEEDBACK item if not. Don't fall back to Base; we're 0G-only.
- [ ] Set up monorepo: `bun create` + Turborepo + workspaces for `packages/*`, `apps/*`, `contracts/*`, `examples/*`
- [ ] Stub out `packages/core` with empty `Agent`, `Memory`, `Inference`, `Executor` interfaces
- [ ] Initial CI: `bun test`, `forge test`, lint

**Exit criteria:** monorepo builds, all sponsor accounts ready, signed-in CLI access works.

## Day 1 — Identity layer (full day)

- [ ] `contracts/ClawforgerINFT.sol` — fork ERC-7857 reference, add `AgentData` struct
- [ ] `contracts/SkillRegistry.sol` — minimal mapping + emit events
- [ ] `contracts/RoyaltyVault.sol` — mUSDC + ReentrancyGuard, 5/95 split
- [ ] `contracts/MUSDC.sol` — mock USDC ERC-20 with permissionless `mint()` (testnet x402 settlement asset)
- [ ] Deploy all four to 0G Galileo testnet (single chain — no Base, no second chain)
- [ ] `packages/inft-identity`: mint, transferWithReencryption, updateMetadata
- [ ] Unit tests for AES-256-GCM encryption + 0G Storage round-trip
- [ ] CLI script: `bun scripts/mint-agent.ts --name researcher` mints a test iNFT end-to-end

**Exit criteria:** can mint an iNFT, see it on 0G explorer, fetch+decrypt its intelligence blob from 0G Storage.

## Day 2 — Memory + Inference (full day)

- [ ] `packages/memory-0g`: KV/Log adapters wrapping `@0gfoundation/0g-ts-sdk`, with encryption
- [ ] `packages/core`: wire `Memory` interface to memory-0g
- [ ] Inference adapter for 0G Compute broker (qwen3.6-plus initially, fall back to GLM-5-FP8)
- [ ] `packages/core`: simple plan→act loop using inference + memory
- [ ] Smoke test: hardcoded "researcher" agent reasons about a task, persists thought to 0G Log

**Exit criteria:** agent does one full inference call via 0G Compute, persists result to 0G KV, can be read back.

## Day 3 — Skill forge + sandbox (full day)

- [ ] `packages/skill-forge`:
  - [ ] Bun isolated worker sandbox harness
  - [ ] Code-gen prompt template (with strict TypeScript-only schema)
  - [ ] Schema validation + success-criteria runner
  - [ ] Artifact upload to 0G Storage Log
  - [ ] KV registry write
  - [ ] iNFT metadata update via inft-identity
- [ ] Reference success criteria DSL: `{ kind: 'jsonSchemaMatch', schema: ... }` and `{ kind: 'stringContains', s: ... }`
- [ ] Researcher example: cold agent that evolves a `fetch_arxiv` skill on demand

**Exit criteria:** running `bun examples/researcher` against task "summarize arxiv paper 2604.27264" results in a new skill artifact uploaded to 0G Storage and a metadata-updated iNFT.

## Day 4 — KeeperHub executor + x402 marketplace (full day)

- [ ] `packages/keeperhub-execute`:
  - [ ] MCP client wrapper (`workflows.create`, `workflows.run`, polling)
  - [ ] `compileToWorkflow(intent)` for: `transferERC20`, `contractCall`, `multistep`
  - [ ] Hook into `Executor` interface in core
- [ ] `packages/x402-facilitator`: our own ~150-LOC facilitator on 0G (no public x402 facilitator on 0G yet — we ship the first one)
  - [ ] `POST /verify` — EIP-712 signature recover + on-chain mUSDC allowance check
  - [ ] `POST /settle` — atomic mUSDC transferFrom payer → vault
- [ ] `packages/x402-skill-market`:
  - [ ] Endpoint server: HTTP 402 paywall on `/skill/:hash`
  - [ ] Payment receipt verification (against our own facilitator)
  - [ ] On valid receipt → execute artifact in sandbox, return result
  - [ ] Settlement workflow: x402 receipt → KeeperHub workflow → RoyaltyVault.settle() on 0G
- [ ] **End-to-end test**: Writer agent discovers Researcher's skill, pays via x402, calls it, gets data, mUSDC arrives at Researcher's iNFT owner

**Exit criteria:** complete loop runs locally with two agents, one mac, real testnet mUSDC moving on 0G Galileo only.

## Day 5 — Studio UI + swarm demo (full day)

- [ ] `apps/studio` (Vite + React):
  - [ ] Mint page (form → calls `mintAgent`)
  - [ ] Agent detail page (shows iNFT metadata, skill list, royalty earnings, KeeperHub run history)
  - [ ] Skill marketplace browser (queries SkillRegistry + 0G KV)
  - [ ] Live demo button: "Run Researcher → Writer flow"
- [ ] `examples/swarm-demo`: 4-agent swarm (planner/researcher/critic/executor) collaborating on shared 0G KV memory, paying each other for skills
- [ ] **Demo video script** drafted

**Exit criteria:** Studio is demoable, the killer 3-minute flow works without manual intervention.

## Day 6 — Polish + ENS bonus + Uniswap example (full day)

Pick ONE of these to push, based on time:

- **A. ENS subnames** (highest ROI, ~6 hours): CCIP-Read resolver for `*.clawforger.eth` mapping to iNFT metadata. Adds ENS submission. **Recommended.**
- **B. Uniswap trader example** (~6 hours): treasury rebalance via KeeperHub workflows + Uniswap Trading API. Adds Uniswap submission with strong FEEDBACK.md.
- **C. AXL transport for swarm** (~10 hours): replace HTTP between swarm agents with AXL nodes. Adds AXL submission.

Whichever you pick, finish:
- [ ] FEEDBACK.md (KeeperHub focus + brief Uniswap notes if B was picked)
- [ ] README.md polished, badges, quickstart, architecture diagrams rendered
- [ ] Smoke-test demo script on a fresh laptop

## Day 7 — Demo video + submission (full day)

- [ ] Record demo video (≤ 3 minutes per all 3 sponsor requirements)
- [ ] Draft submission text for each track (0G framework, 0G iNFT, KeeperHub, optional ENS/Uniswap/AXL)
- [ ] Final test: judge clones repo, runs `bun install && bun dev`, sees something
- [ ] Submit before deadline with buffer
- [ ] Post on X tagging @0G_labs, @KeeperHubApp, @ensdomains, @gensynai, @uniswapfnd

## Critical-path risks & mitigations

| Risk | Mitigation |
|------|------------|
| 0G Compute broker is flaky / rate-limited | Cache last successful inferences, support fallback to local LLM via Ollama |
| ERC-7857 reference impl has gaps | Have a minimal compliant fork ready; don't promise full spec, ship enough for the demo |
| KeeperHub MCP doesn't support a workflow primitive we need | Fall back to direct REST API; document gap in FEEDBACK.md (which earns the bounty) |
| x402 testnet flow is brittle | Hardcode a pre-signed receipt path for the demo, document the production flow |
| Sandbox compromises agent host | Day 3 keeps the sandbox simple (Bun worker isolate); document the wasm migration, don't try to build it now |
| Demo recording fails on the day | Pre-record on day 6 evening as a backup; live-demo only if everything works |

## Definition of done (judging eve)

- [ ] iNFT contract deployed, 3+ test agents minted, viewable on 0G explorer
- [ ] One end-to-end skill-forge → x402 → KeeperHub → RoyaltyVault loop demonstrable in ≤ 90 seconds
- [ ] At least one OpenClaw plugin published (even minimal)
- [ ] FEEDBACK.md ≥ 800 words, specific bugs, specific feature requests
- [ ] Demo video uploaded, ≤ 3 minutes, captions on
- [ ] README quickstart works from clean clone
- [ ] Submitted to all targeted tracks

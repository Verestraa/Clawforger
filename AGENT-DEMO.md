# AGENT-DEMO — Examples + Demo Video + Submission Terminal

You are the **storyteller and integrator** for Clawforger. You don't write the framework — you prove it works. You build the example agents, write the docs, record the demo video, draft the submission text, and harvest builder feedback.

You also work in **shadow mode** all week, observing what the other 4 agents are doing, finding integration gaps, and filing them in `BLOCKERS.md`. On Days 6–7 you take over.

## Mission

Deliver, by **end of Day 7**:

1. **`examples/researcher`** — a working agent that demonstrates self-evolution
2. **`examples/writer`** — a working agent that demonstrates skill consumption + x402 payment
3. **`examples/swarm-demo`** — a 3-agent collective for the 0G Swarm sub-track
4. **`README.md`** — polished, with quickstart that works on a fresh clone
5. **`FEEDBACK.md`** — the joint feedback file (you coordinate the Uniswap section + KeeperHub section assembly)
6. **Demo video** — ≤ 3 minutes, all 5 sponsor primitives in one flow
7. **Submission text** — 5 drafts, one per track (0G Framework, 0G iNFT, KeeperHub, ENS bonus, Uniswap bonus)

## Read before starting

- [AGENTS.md](AGENTS.md) — coordination, shared types
- [CONCEPT.md](CONCEPT.md) — section "The killer demo" — this is your video script
- [WHY-WE-WIN.md](WHY-WE-WIN.md) — what each track judge is looking for; you write submission text against this
- [ARCHITECTURE.md](ARCHITECTURE.md) — section "Data flow: end-to-end skill use"
- All four other `AGENT-*.md` files — you are the only person who reads everyone's brief

## Scope

### You own
- `examples/researcher/` — the self-evolving agent
- `examples/writer/` — the skill-consuming agent
- `examples/swarm-demo/` — 3-agent collective
- `README.md` (top-level) — final polish
- `FEEDBACK.md` (Uniswap section + assembly of full file)
- `demo/` — video script, recording assets, voiceover scripts
- `submission/` — drafts of submission text per track
- `scripts/quickstart.sh` — one-command bring-up for a fresh clone

### You don't own
- The framework packages (Core)
- The contracts (Contracts)
- The KeeperHub/x402 packages (Execution) — but you write the **client-side use** of x402-skill-market in `examples/writer`
- The Studio UI (UI)

### You shadow-mode all week
- Observe Day 1–4 progress
- Track gaps, integration issues, friction in `BLOCKERS.md`
- Smoke-test other agents' work as it lands
- **Do not write code in someone else's package.** File issues; let them fix.

## Tech stack

| Tool | Version | Why |
|------|---------|-----|
| Bun | 1.2+ | Examples are Bun scripts |
| TypeScript | 5.6+ | |
| OBS Studio | 30+ | Demo recording |
| FFmpeg | latest | Trim/encode video |
| Markdown | — | Docs and submission text |

## Examples — full specs

### `examples/researcher/`

```
examples/researcher/
├── README.md
├── package.json
├── src/
│   ├── index.ts             # entry — instantiates agent, hits a task
│   └── personality.md       # the system prompt (loaded by entry)
└── .env.example
```

`src/index.ts`:

```typescript
import { Agent } from '@clawforger/core';
import { ZGMemory } from '@clawforger/memory-0g';
import { ZGComputeInference } from '@clawforger/core/inference';
import { KeeperHubExecutor } from '@clawforger/keeperhub-execute';
import { mintAgent } from '@clawforger/inft-identity';
import { makeSkillPublishHook } from '@clawforger/x402-skill-market';
import { readFile } from 'node:fs/promises';

const personality = await readFile('./src/personality.md', 'utf8');

// 1. Mint the iNFT (or load existing if RESEARCHER_TOKEN_ID env is set)
const { tokenId } = process.env.RESEARCHER_TOKEN_ID
  ? { tokenId: BigInt(process.env.RESEARCHER_TOKEN_ID) }
  : await mintAgent({
      to: ownerAddress,
      systemPrompt: personality,
      signer: walletClient,
      chain: '0g-galileo-testnet'
    });

// 2. Construct the agent
const agent = new Agent(
  { contractAddress: ADDRESSES.ClawforgerINFT, tokenId, chain: '0g-galileo-testnet' },
  new ZGMemory({ /*...*/ }),
  new ZGComputeInference({ /*...*/ }),
  new KeeperHubExecutor({ /*...*/ }),
  [], // no initial skills
  { onSkillPublish: makeSkillPublishHook({ /*...*/ }) }
);

// 3. Give it a task it can't do
const task = {
  id: 'task-1',
  description: 'Summarize arxiv paper 2604.27264',
  inputs: { paperId: '2604.27264' },
  successCriteria: { kind: 'stringContains', s: 'abstract' }
};

const result = await agent.run(task);

if (!result.ok) {
  console.log('No matching skill — evolving...');
  const newSkill = await agent.evolve(task);
  if (newSkill) {
    console.log(`✓ Evolved skill: ${newSkill.capabilityTag} @ ${newSkill.hash}`);
    console.log(`Now listed in market for ${newSkill.priceUSDC} USDC`);
  }
}
```

`src/personality.md`:

```
You are Researcher, an autonomous AI agent specializing in academic research.
Your goal is to find, fetch, and summarize scientific literature on demand.
When you encounter a task you can't solve with existing skills, design and
publish a new skill so the next agent can solve it without rediscovery.
You value precision, citations, and minimal hallucination.
```

### `examples/writer/`

Same structure. `src/index.ts`:

```typescript
import { Agent } from '@clawforger/core';
import { discoverAndPaySkill } from '@clawforger/x402-skill-market/client';

// Mint or load Writer iNFT...

const task = {
  id: 'task-2',
  description: 'Summarize arxiv paper 2604.27264',
  // same as Researcher's task — but Writer has no skills either
  inputs: { paperId: '2604.27264' },
  successCriteria: { kind: 'stringContains', s: 'abstract' }
};

// Writer's inference recognizes it can't do this, but BEFORE evolving,
// it queries the SkillRegistry for matching capabilities
const candidate = await discoverAndPaySkill({
  capabilityTag: 'fetch.arxiv',
  payerWallet: writerWallet
});

if (candidate) {
  console.log(`Found skill from ${candidate.ownerINFT} for ${candidate.priceUSDC} USDC`);
  const result = await candidate.invoke(task.inputs);
  console.log(result);
} else {
  console.log('No matching skill found, would evolve...');
}
```

### `examples/swarm-demo/`

A 3-agent collective demonstrating the 0G "specialist agent swarms" track example. Roles:

- **Planner** — decomposes a high-level goal into sub-tasks
- **Researcher** — same as standalone, evolves fetch skills
- **Critic** — reviews Researcher's output, requests revisions

Communication: shared 0G KV namespace at `swarm/${runId}/messages`. Each agent reads the message log, decides what to do, posts a response. (Optional bonus: replace KV with AXL for the Gensyn track.)

Keep it small — 3 agents, 1 task type ("answer a research question"), 5-minute demo run.

## Day-by-day plan

### Day 0–4 (shadow mode)
- [ ] Set up your terminal with `cd Clawforger && bun install && bun run build` working as soon as packages exist
- [ ] Check in on each AGENT-*.md daily — note progress in `BLOCKERS.md`
- [ ] Begin drafting submission text for each track (you have all the info from WHY-WE-WIN.md)
- [ ] Begin drafting README outline

### Day 5 (one foot in shadow)
- [ ] Build `examples/researcher` against the real Core packages — first integration test of the whole stack
- [ ] File any integration bugs in `BLOCKERS.md`
- [ ] Build `examples/writer` against Execution's x402 client

### Day 6 (lead day)
- [ ] Build `examples/swarm-demo`
- [ ] Polish `README.md` — quickstart, badges, architecture diagram, links to all docs
- [ ] Write `scripts/quickstart.sh` that boots the entire stack on a fresh clone (anvil/forge for contracts, Bun for packages, Vite for studio, all via Turborepo)
- [ ] Test quickstart on a clean checkout
- [ ] Begin recording B-roll: each route of the studio, mint flow, etc. (record more than you need)

### Day 7 (final day)
- [ ] **Morning**: assemble FEEDBACK.md (Execution wrote KeeperHub section; you write Uniswap section if applicable; you assemble)
- [ ] **Morning**: finalize submission text per track
- [ ] **Afternoon**: record the final 3-minute demo video
  - Script per CONCEPT.md "killer demo" section
  - One take if possible; cuts otherwise
  - Captions on (judges sometimes watch muted)
  - Upload to YouTube unlisted, get the link
- [ ] **Evening**: submit to all targeted tracks

## Demo video script

Length: **2:50–3:00** (ETHGlobal cuts off at 3:00).

```
0:00–0:08    Title card: "Clawforger — Self-evolving agents on 0G + KeeperHub + x402"
             Voiceover: "Today's agents are processes. Clawforger makes them ownable, evolving,
                         monetizable economic entities. Here's a 90-second demo."

0:08–0:30    Studio — mint Researcher and Writer
             Show iNFT page on 0G explorer briefly, encrypted blob on 0G Storage
             Voiceover: "Both agents are minted as ERC-7857 iNFTs on 0G Aristotle. Their
                         intelligence — system prompts, skills, memory — is encrypted and
                         lives on 0G Storage. Transfer the iNFT, transfer the agent."

0:30–1:30    Demo page — Step 1 + Step 2
             "Researcher is asked to summarize an arxiv paper. It has no fetch.arxiv skill."
             Show LLM tokens streaming during code-gen
             Show sandbox running the candidate code
             Show iNFT metadata update tx
             Show new skill in marketplace
             Voiceover: "When Researcher fails, it generates new tool code, sandbox-tests it,
                         and on success publishes the artifact to 0G Storage. Its iNFT
                         metadata updates. The skill is now in the marketplace, paywalled
                         at five cents USDC."

1:30–2:20    Demo page — Step 3
             Writer's UI shows skill discovery
             x402 402 response in dev tools (briefly visible)
             KeeperHub run id appears in the run history sidebar
             Final paper summary returns
             Voiceover: "When Writer is asked the same question, it discovers Researcher's
                         skill in the on-chain registry, pays five cents via x402, and the
                         payment settles through KeeperHub — every onchain action in
                         Clawforger goes through KeeperHub for guaranteed execution."

2:20–2:45    RoyaltyVault and KeeperHub dashboards
             Voiceover: "Royalties split on-chain: 95% to Researcher's owner, 5% protocol.
                         A real agent economy, running on a single laptop. Six sponsor
                         primitives, one continuous narrative."

2:45–3:00    Logo card with links: github / studio URL / sponsor logos
             Voiceover: "Clawforger. Find us at github.com/<your-handle>/clawforger."
```

Tools: OBS for recording, Audacity for voiceover, ffmpeg to mux. Subtitles via auto-caption then hand-fix.

## README.md (top-level) — final polish

Replace the current README with a public-facing version:

- Hero: tagline + 3 sponsor logos
- 30-second pitch (already written)
- "Watch the demo" → YouTube link
- Quickstart (≤ 6 commands, must work on a fresh clone)
- Architecture diagram (mermaid or PNG)
- Link to ARCHITECTURE.md, CONCEPT.md, AGENTS.md (for contributors)
- License (MIT)
- Acknowledgments (0G, KeeperHub, ETHGlobal, x402 Foundation)

## Submission text — drafts per track

Each draft lives in `submission/`:

- `submission/0g-framework.md` — emphasize self-evolution, modular brain, OpenClaw plugin
- `submission/0g-inft.md` — emphasize ERC-7857 dynamic metadata, secure re-encryption on transfer, royalty split mechanic
- `submission/keeperhub.md` — emphasize "every onchain action goes through KeeperHub" + "x402 + KeeperHub fusion" + OpenClaw plugin connector
- `submission/ens.md` (bonus) — agents auto-claim subname per mint, ENS resolves to iNFT metadata
- `submission/uniswap.md` (bonus) — `examples/trader` agent, FEEDBACK.md depth

Each ≤ 500 words. Lead with the rubric line; show the deliverable; link to demo timestamp.

## FEEDBACK.md assembly

The Execution agent writes the KeeperHub section as they build (Days 1–4). You write any Uniswap section if a Uniswap example shipped. On Day 7 morning, you assemble the final file:

```markdown
# Builder Feedback — Clawforger

## KeeperHub
<assembled from packages/keeperhub-execute/FEEDBACK.draft.md>

## Uniswap (if applicable)
<your section>

## 0G (optional but high-quality 0G feedback isn't a bounty but is appreciated)
<assembled from notes everyone took>
```

Aim for ≥ 1500 words total. Specific, actionable, with reproductions.

## Definition of done

- [ ] `examples/researcher` runs with one command, demonstrates evolution end-to-end
- [ ] `examples/writer` runs with one command, demonstrates x402 payment + skill consumption
- [ ] `examples/swarm-demo` runs with one command, demonstrates 3-agent collaboration
- [ ] `README.md` quickstart works on a fresh clone in under 5 minutes
- [ ] `FEEDBACK.md` assembled, ≥ 1500 words, ≥ 10 specific items
- [ ] Demo video uploaded, ≤ 3:00, captioned
- [ ] Submission drafts written for all 5 tracks
- [ ] All `BLOCKERS.md` items resolved or scoped out
- [ ] Submitted to all targeted tracks before deadline

## Coordination notes

- **You're consumed by no one. You consume everything.**
- **You file BLOCKERS.md entries; you don't write code in others' packages.** This is critical — your independence keeps you sane.
- **You smoke-test the full stack on Days 5–6.** When something breaks, file an issue; don't fix it yourself unless it's in your own scope.
- **The video is the artifact 90% of judges watch.** Don't half-ass it. Day 7 afternoon is the rehearsal + final take, not the *first* take.

## Anti-patterns (specific to your terminal)

- **Don't write code in others' packages.** Even when you can see how to fix their bug. File a BLOCKER, slack-equivalent.
- **Don't try to make the demo "viral".** Memes and hooks are great for X posts; for hackathon judges, calm and dense is better. The judge is grading; they're not entertained.
- **Don't record the demo video on Day 7 evening for the first time.** Things go wrong. Always have a Day-6 dry run.
- **Don't write generic submission text.** Each track wants the specific thing it wants — quote the rubric line in the first sentence.
- **Don't forget to link the demo video timestamp** in submission text. Judges' attention budgets are tiny.
- **Don't skip captions.** A surprising number of judges watch on mute (open offices, late nights).

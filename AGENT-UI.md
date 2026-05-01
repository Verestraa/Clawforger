# AGENT-UI — Studio Frontend Terminal (Vite + React)

You are the **frontend engineer** for Clawforger. You own `apps/studio` — the web UI judges will see in the demo video. Your job is to make the demo *visible* and the framework *touchable*.

This is the surface a 0G judge spends 30 seconds on before deciding whether the project feels real. **It must feel real.**

## Mission

Deliver a production-feel single-page app by **end of Day 5** that lets a user:

1. **Mint** a Clawforger agent as an iNFT (form → wallet sign → tx via wagmi)
2. **View** an agent's detail page: iNFT metadata, skill manifest, royalty earnings, KeeperHub run history, evolution timeline
3. **Browse** the skill marketplace: list of all published skills with capability tag, price, owner, useCount
4. **Run the live demo flow** in one click: "Researcher evolves → Writer pays → settlement settles" with live UI updates

By Day 5 EOD, the demo button on the Studio runs the full Researcher→Writer flow with visible progress at every step.

## Read before starting

- [AGENTS.md](AGENTS.md) — section "Shared interface contracts"
- [ARCHITECTURE.md](ARCHITECTURE.md) — sections on `apps/studio`, data flow diagram
- [CONCEPT.md](CONCEPT.md) — the killer demo script. Your UI choreographs this exact flow.

## Scope

### You own
- `apps/studio/` — the entire Vite + React app
- Any reusable UI components you spin out into `packages/ui/` (only if needed by Demo agent)
- Studio's own `.env.example`

### You don't own
- Smart contracts (Contracts agent)
- The runtime / SDK packages (Core agent)
- Execution / x402 server (Execution agent)
- The demo *script* (Demo agent — but you give them the working UI to record)

You **consume** packages from the other 3 agents:
- `@clawforger/core` — types, agent loading
- `@clawforger/inft-identity` — mint, evolve from the browser
- `@clawforger/x402-skill-market` — read skills via its REST API
- `addresses.json` — contract addresses
- `packages/core/src/abis/*.json` — contract ABIs

## Tech stack

| Tool | Version | Why |
|------|---------|-----|
| Vite | 6+ | Fast HMR, no SSR overhead — pure SPA fits a studio dashboard |
| React | 19 | Latest, with `use()` for promise unwrapping |
| TypeScript | 5.6+ | Match the rest of the monorepo |
| wagmi | 2.13+ | React hooks for EVM (`useAccount`, `useReadContract`, `useWriteContract`) |
| viem | 2.21+ | Lower-level EVM client (matches Core) |
| RainbowKit | 2.2+ | Wallet connect UI — battle-tested, judges-friendly |
| @tanstack/react-query | 5+ | wagmi peer; data fetching |
| react-router | 7+ | Client-side routing |
| Tailwind CSS | 4+ | Styling |
| `shadcn/ui` (radix + cva) | latest | Component library |
| `lucide-react` | latest | Icons |
| `framer-motion` | 11+ | Subtle animations on evolution events (judges remember motion) |
| `sonner` | latest | Toast notifications |

## Setup

```bash
mkdir -p apps && cd apps
bun create vite@latest studio -- --template react-ts
cd studio
bun add wagmi viem @rainbow-me/rainbowkit @tanstack/react-query react-router framer-motion sonner lucide-react
bun add -D tailwindcss@next @tailwindcss/vite
bunx shadcn@latest init
bunx shadcn@latest add button card dialog form input table tabs toast badge
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@clawforger/core': path.resolve(__dirname, '../../packages/core/src'),
      '@clawforger/inft-identity': path.resolve(__dirname, '../../packages/inft-identity/src'),
    }
  },
  server: { port: 3000 }
});
```

### `.env.example`

```bash
VITE_WALLETCONNECT_PROJECT_ID=
VITE_X402_MARKET_URL=http://localhost:3700
VITE_KEEPERHUB_PROJECT_ID=         # optional, for run history embed
VITE_DEFAULT_CHAIN=0g-galileo-testnet
```

`addresses.json` is loaded at runtime via a fetch from `/addresses.json` (copy it from repo root into `apps/studio/public/addresses.json` on dev start, or use a Vite plugin to mirror).

## Page-by-page spec

### Routes

```
/                       Landing — pitch + "Connect Wallet" + "Run Demo"
/mint                   Mint a new agent
/agents                 List of all minted agents (read from iNFT contract)
/agents/:tokenId        Agent detail (metadata, skills, royalty earnings, run log)
/market                 Skill marketplace browser
/demo                   Live demo flow (the 90-second showcase)
```

### `/` — Landing

- Tagline + 3 sponsor logos (0G, KeeperHub, x402)
- "Connect Wallet" (RainbowKit `<ConnectButton />`)
- Two CTA buttons: "Mint your first agent" → `/mint`, "Run live demo" → `/demo`
- Below the fold: 4 stat tiles read live from chain (total agents minted, total skills published, total USDC settled, total KeeperHub runs)

### `/mint` — Mint flow

```
┌──────────────────────────────────────────┐
│  Mint a new Clawforger agent              │
│                                          │
│  [Name input: "Researcher"        ]      │
│  [Personality / system prompt:           │
│   <textarea, 6 rows>                     │
│  ]                                       │
│  [Initial skill capability tags:         │
│   chips: fetch.* / web.* / math.* ...    │
│  ]                                       │
│                                          │
│  Estimated gas: ~0.001 0G                │
│  [Mint Agent] (calls inft-identity)      │
└──────────────────────────────────────────┘
```

Implementation: use `@clawforger/inft-identity.mintAgent` directly from the browser. The wagmi `useWalletClient` provides the signer. After mint succeeds, navigate to `/agents/:tokenId` and show a celebratory toast.

### `/agents/:tokenId` — Agent detail

Tabs:
- **Overview** — owner, intelligence hash (link to 0G Storage explorer), royalty vault address, evolution count, last evolved at
- **Skills** — table of `SkillManifest`s currently registered to this iNFT, with price, useCount, total earned (sum from RoyaltyVault events)
- **Memory log** — last 50 entries from 0G Log (decrypted client-side using owner signature)
- **Evolution timeline** — vertical timeline of every `AgentEvolved` event, each entry showing what skill was added
- **Run history** — list of recent KeeperHub runs that touched this agent (read from KeeperHub API or our local mirror)

### `/market` — Skill marketplace

- Search bar (filter by capabilityTag)
- Sort by: most-used / cheapest / newest
- Each row: capability tag, owner agent (clickable link to `/agents/:tokenId`), price (USDC), useCount, "Try it" button
- "Try it" → opens a modal where the user can craft an input matching `schemaIn`, sign an x402 payment, see the response

### `/demo` — Live demo flow

This is the page judges will watch in the video. Make it choreographed.

```
[Step 1 of 4] Mint Researcher and Writer
  → spinner → "✓ Researcher minted (token #42)"
                "✓ Writer minted (token #43)"

[Step 2 of 4] Give Researcher a task it can't do
  → input: "Summarize arxiv 2604.27264"
  → agent thinks (LLM tokens stream in)
  → "❌ No matching skill. Evolving..."
  → code-gen → sandbox test → ✓ skill `fetch.arxiv` published
  → "Skill listed in market for 0.05 USDC"

[Step 3 of 4] Give Writer the same task
  → "🔍 Searching SkillRegistry... found fetch.arxiv (Researcher)"
  → "💸 Paying 0.05 USDC via x402..."
  → KeeperHub workflow run id appears
  → "✓ Skill executed. Result: <paper summary>"

[Step 4 of 4] Settlement
  → RoyaltyVault: 0.0475 USDC → Researcher's owner
  →             : 0.0025 USDC → protocol treasury
  → "✓ Done in 47 seconds"
```

Each step is a `<Card>` with a state machine: `pending`, `running`, `succeeded`, `failed`. Use `framer-motion` for the running spinner and a checkmark animation on success.

Drive this with a state machine (xstate or a simple reducer; reducer is fine for this scope).

## Components

```
src/
├── App.tsx
├── main.tsx
├── routes/
│   ├── Landing.tsx
│   ├── Mint.tsx
│   ├── AgentsList.tsx
│   ├── AgentDetail.tsx
│   ├── Market.tsx
│   └── Demo.tsx
├── components/
│   ├── ConnectBar.tsx
│   ├── AgentCard.tsx
│   ├── SkillRow.tsx
│   ├── EvolutionTimeline.tsx
│   ├── KeeperHubRunRow.tsx
│   ├── DemoStep.tsx        # state machine card for /demo
│   └── ui/                 # shadcn-generated
├── lib/
│   ├── wagmi.ts            # config (chain: 0g-galileo only — single chain)
│   ├── addresses.ts        # loads /addresses.json
│   ├── x402-client.ts      # browser-side x402 payment helper
│   └── kv.ts               # 0G KV reads (via Core's memory-0g, browser-safe)
└── hooks/
    ├── useAgent.ts         # reads AgentData from iNFT
    ├── useSkills.ts        # reads SkillRegistry by tag
    ├── useEvolutionLog.ts  # subscribes to AgentEvolved events
    └── useDemoFlow.ts      # the /demo state machine
```

## Day-by-day plan

### Day 0 (afternoon)
- [ ] `apps/studio` scaffolded, `bun dev` shows blank Vite/React page
- [ ] RainbowKit + wagmi configured for 0G Galileo testnet (single chain — Clawforger is all-in on 0G)
- [ ] Tailwind + shadcn working, dark mode set up

### Day 1 (parallel with Contracts deploying)
- [ ] Build the design system: layout, ConnectBar, theme, typography, spacing
- [ ] Landing page polish-to-spec
- [ ] Use mock `addresses.json` and mock data for everything

### Day 2 (full day, after Core has `inft-identity` minimally working)
- [ ] `/mint` flow against real `inft-identity.mintAgent`
- [ ] `/agents` list reads real iNFT contract events
- [ ] `/agents/:tokenId` Overview tab works

### Day 3 (full day)
- [ ] Skills tab on agent detail (reads SkillRegistry events)
- [ ] Memory log tab (consumes Core's `memory-0g` for decrypted log read)
- [ ] Evolution timeline (event log subscription)

### Day 4 (full day)
- [ ] `/market` page fully functional against Execution's `/skills` endpoint
- [ ] "Try it" modal with x402 payment flow from browser

### Day 5 (full day) — the demo day
- [ ] `/demo` page with the 4-step choreographed flow
- [ ] Each step driven by real backend calls (no fakes for the demo)
- [ ] framer-motion polish on transitions
- [ ] Smoke test: click "Run live demo" cold, demo completes in ≤ 90 seconds
- [ ] Mobile-responsive check (judges watch on laptop, but if they pull up on a phone it shouldn't be broken)

### Day 6 (polish)
- [ ] Empty states for every list (no agents minted yet, no skills, etc.)
- [ ] Error states with actionable messages ("Wallet not connected" / "Switch to 0G Galileo")
- [ ] Lighthouse pass: ≥ 90 performance / accessibility
- [ ] Open Graph metadata + favicon for the demo video preview

### Day 7
- [ ] Help Demo agent record screen captures of the Studio
- [ ] Last-mile bug fixes only

## Tests

UI doesn't need 80% test coverage. Aim for:

- Component snapshot tests for `<DemoStep>`, `<AgentCard>`, `<SkillRow>` (vitest + @testing-library/react)
- One e2e test (Playwright) of the `/demo` flow against a local stack
- Manual QA checklist for each route before EOD Day 5

## Definition of done

- [ ] All 6 routes render without errors on a fresh wallet connect
- [ ] `/demo` flow runs end-to-end in ≤ 90 seconds against the real testnet stack
- [ ] All data is live from chain / Execution server — no hardcoded values
- [ ] Lighthouse ≥ 90 / 90 / 90 / 90
- [ ] Looks coherent on 1440x900 (judges' standard) and 1920x1080 (recording)
- [ ] No console errors during the demo flow

## Coordination notes

- **You're consumed by no one.** You're the most downstream. That means:
  - You're blocked by everyone for real data
  - You should mock everything and unblock yourself relentlessly
  - Day 1 you should already have a beautiful UI running on mocks; live data swaps in over Days 2–4
- **You feed the Demo agent.** They record your UI for the demo video. Don't ship breaking changes after Day 6.
- **Don't change shared types.** Core owns them. If you need a UI-specific shape, derive it locally.

## Anti-patterns (specific to your terminal)

- **Don't pick Next.js.** This project is a SPA dashboard — no SSR needs, no SEO needs. Vite + React is faster to iterate, simpler to deploy, and keeps the bundle thin.
- **Don't go overboard on animations.** Subtle motion on state changes is great; CSS-Anime swirling 3D backgrounds is cringe. Judges notice both.
- **Don't build a kitchen-sink dashboard.** Build the 6 routes the demo needs. Skip "settings", "profile", "help", "API docs viewer".
- **Don't skip the empty + error states.** A judge connecting a fresh wallet sees the empty state first; if it says "Loading..." forever, they bounce.
- **Don't hardcode addresses or chain configs.** Read from `addresses.json`. Read from `import.meta.env`. Be ready to switch chains in 30 seconds.
- **Don't ship a 4MB bundle.** Tree-shake. Lazy-load `/demo` and `/market` if needed. Lighthouse perf score is a judging signal.

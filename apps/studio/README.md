# @clawforger/studio

> The Clawforger frontend — Vite + React 19 dashboard for minting iNFT agents, watching them self-evolve, and triggering agent-to-agent purchases live on chain.

Single-page Vite app, no SSR. Talks to two backend services: the marketplace server (`:3700` for chat + per-agent wallets + skill listings) and the x402 facilitator (`:3701` for payment settlement). All wallet connections go through wagmi + RainbowKit.

---

## Routes

| Route | What it does |
|---|---|
| `/` | Landing page — pitch + live chain stats (skills published, mUSDC settled, evolutions) |
| `/agents` | Your iNFT agents — rich cards with persona avatar, wallet balance, skill count |
| `/agents/:tokenId` | Agent detail — wallet panel, persona badge, skills, evolution timeline, encrypted memory log |
| `/agents/:tokenId/chat` | Live chat with the agent. Persona-themed avatar in header, compute pool badge, wallet badge (mUSDC + 0G), TEE-verified replies |
| `/mint` | Mint a new iNFT with one of four persona presets (Researcher / Writer / Trader / Analyst) |
| `/demo` | Curated walkthrough — 4 ordered cards linking to the real flows + pinned chainscan receipts (no mocks, no fake timers) |
| `/market` | Marketplace listings — every published skill across every iNFT |
| `/dashboard` | Onchain stats: total skills published, mUSDC settled (real `RoyaltyDistributed` event scan), top-earning agents |

---

## Setup

```bash
# From the repo root
bun install

# Dev server (port 5173)
bun --filter @clawforger/studio dev

# Production build (output: apps/studio/dist)
bun --filter @clawforger/studio build

# Preview the prod build locally
bun --filter @clawforger/studio preview
```

The studio expects the marketplace + facilitator servers running. Start those first:

```bash
bun run market           # :3700
bun run facilitator      # :3701
```

---

## Environment

Vite reads `VITE_*` vars at build time. Create `apps/studio/.env.production` (gitignored) for deploy, or `apps/studio/.env.local` for dev overrides.

```bash
# Marketplace + chat server (used by every component that hits /admin/* or /skills)
VITE_X402_MARKET_URL=http://localhost:3700      # dev
# VITE_X402_MARKET_URL=https://skill-market.clawforger.xyz   # prod

# WalletConnect — get a real one at https://cloud.reown.com (free)
# Without this, you'll see 403/400 errors from pulse.walletconnect.org
VITE_WALLETCONNECT_PROJECT_ID=

# Default chain (currently unused at runtime; reserved for future multi-chain)
VITE_DEFAULT_CHAIN=0g-galileo-testnet
```

If `VITE_X402_MARKET_URL` is unset, components fall back to `http://localhost:3700`. Useful for local dev; will 404 on a deployed build.

---

## Architecture notes

**No private keys in the browser.** The studio never holds a wallet seed. Per-agent sub-wallets are derived server-side from `AGENT_WALLET_SEED` in the marketplace env; the studio just calls `/admin/agent/:tokenId/wallet` to read the agent's address + balances.

**Chat goes through the server.** The studio POSTs to `/admin/chat` with `{ agentTokenId, systemPrompt, messages }`. The marketplace server runs the LLM tool loop (DeepSeek V3 on Aristotle mainnet via 0G Compute), executes any `purchase_skill` / `evolve_new_skill` tool calls, and returns the final reply with all invocations + tx hashes. The 0G Compute key never reaches the browser bundle.

**Persona color language is one source of truth.** `src/components/AgentAvatar.tsx` exports `PERSONA_TONE` + `PERSONA_SCOPE`. AgentCard, AgentDetail, AgentChat all import from there — change a color in one file and every page updates.

**RichText renders agent receipts.** Inline markdown for `[link](url)`, `**bold**`, `` `code` ``, and bare URLs. Deliberately does NOT auto-link bare 0x hashes — receipt formatting in the consumer system prompt emits explicit markdown links so chainscan URLs go to `/tx/<hash>` and skill artifact hashes (which live on 0G Storage, not chain) don't 404 on chainscan.

---

## File layout

```
apps/studio/
├── src/
│   ├── components/
│   │   ├── AgentAvatar.tsx         # persona-aware gradient + icon (single source of persona styling)
│   │   ├── AgentCard.tsx           # rich list card (avatar + balances + skill count)
│   │   ├── AgentWalletPanel.tsx    # full wallet card on agent detail (address + copy + balances)
│   │   ├── AgentWalletBadge.tsx    # compact inline pill for chat header (auto-refreshes)
│   │   ├── ComputePoolBadge.tsx    # active 0G Compute chain + model + ledger balance
│   │   └── TryItModal.tsx          # x402 paid-skill trial modal
│   ├── routes/
│   │   ├── Landing.tsx             # /
│   │   ├── AgentsList.tsx          # /agents
│   │   ├── AgentDetail.tsx         # /agents/:tokenId
│   │   ├── AgentChat.tsx           # /agents/:tokenId/chat
│   │   ├── Mint.tsx                # /mint
│   │   ├── Demo.tsx                # /demo
│   │   ├── Market.tsx              # /market
│   │   └── Dashboard.tsx           # /dashboard
│   ├── hooks/
│   │   ├── useAgentEvents.ts       # on-chain skill / evolution event scans
│   │   └── useChainStats.ts        # RoyaltyDistributed scan for "mUSDC settled" stat
│   ├── lib/
│   │   ├── wagmi.ts                # wagmi config + 0G Galileo chain definition
│   │   ├── contracts.ts            # ABIs + pinned addresses
│   │   ├── intelligence.ts         # build/load encrypted iNFT persona payloads
│   │   ├── keeperhub-bridge.ts     # studio → marketplace mint-via-KH proxy
│   │   └── addresses.ts            # mirror of root addresses.json
│   ├── App.tsx                     # router shell + footer
│   └── main.tsx                    # Vite entry
├── index.html
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Bun + Vite 6 |
| Framework | React 19 |
| Wallets | wagmi v2 + RainbowKit + viem |
| Styles | Tailwind 4 |
| Icons | lucide-react |
| Routing | react-router v7 |
| Toasts | sonner |

No Redux. No SSR. No state management library — `useState` + lifted props + a couple of hooks are enough for the surface area.

---

## Deploy

The build output is a static SPA. Any static host works (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, Caddy, nginx).

Vercel:

```bash
vercel build
vercel deploy --prod
```

Set the `VITE_*` env vars in the dashboard. The marketplace server URL must be HTTPS in production (browsers block mixed content from a `https://` page).

---

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.

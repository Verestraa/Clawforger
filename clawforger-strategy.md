# Clawforger — End-to-End Test Strategy

Sequenced playbook for verifying the full agent economy works on a fresh
machine. Walks through mint → fund → producer self-evolution → consumer
purchase → on-chain verification. Every prompt + command in this file has
been run live against the current codebase. If a step fails, that's a
regression to fix before recording the demo.

Estimated wall-clock time: **~25 min** for the full pass.

---

## 0. Pre-flight (5 min)

### 0.1 Services running

In separate terminals:

```bash
# (a) marketplace + chat server (port 3700)
bun run packages/x402-skill-market/src/server.ts

# (b) x402 facilitator (port 3701)
bun run packages/x402-facilitator/src/server.ts

# (c) studio (Vite, port 5173 by default)
bun --filter @clawforger/studio dev
```

### 0.2 Sanity probes

```bash
# Compute pool reads mainnet?
curl -s http://localhost:3700/admin/compute-balance | jq '.computeChain, .activeModel'
# Expected:
#   { "name": "0G Aristotle", "chainId": 16661, "kind": "mainnet" }
#   "deepseek/deepseek-chat-v3-0324"

# Marketplace reachable?
curl -s http://localhost:3700/skills | jq '.skills | length'
# Any positive number = ok

# Per-agent wallet derivation working?
curl -s http://localhost:3700/admin/agent/1/wallet | jq '.address'
# Expected: a deterministic 0x… address (same every time)
```

If `compute-balance` shows `testnet` instead of `mainnet`: your server is
running with the old `.env`. Restart it with `--env-file=../../.env`.

### 0.3 Wallet hygiene

Connect MetaMask (or whichever wallet) to **0G Galileo testnet**
(chainId 16602). Make sure the wallet has:
- ≥ 0.5 0G testnet (gas for minting)
- The deployer wallet (the one in `.env`) has ≥ 5 mUSDC for funding
  agent sub-wallets

Need mUSDC? It's permissionless — `cast send <MUSDC> "mint(address,uint256)"
<your-addr> 100000000` (= 100 mUSDC at 6 decimals).

---

## 1. Mint the four personas (8 min)

Open studio at `http://localhost:5173/mint`.

For each persona below, click the corresponding preset button at the
bottom of the form, then click **"mint via KeeperHub"** (or the direct
mint route — both work; KH is preferred for the demo because it
populates your KH analytics dashboard).

| # | Persona | Avatar | Verify after mint |
|---|---|---|---|
| 1 | **Researcher** | violet→fuchsia, Brain | Profile page → cyan avatar, "researcher" badge, scope: "academic literature" |
| 2 | **Writer** | amber→rose, FileText | "writer" badge, scope: "prose composition" |
| 3 | **Trader** | emerald→teal, TrendingUp | "trader" badge, scope: "market data" |
| 4 | **Analyst** | cyan→blue, Search | "analyst" badge, scope: "consumer — buys data from other agents" |

Note the four tokenIds. From here on the doc uses `<R>`, `<W>`, `<T>`,
`<A>` as placeholders for the Researcher, Writer, Trader, and Analyst
tokenIds you just minted.

---

## 2. Fund the producer agents (2 min)

Producers don't strictly need pre-funding — they earn by being bought
*from*. But the Analyst MUST be funded to spend.

```bash
# Fund the Analyst with 1 mUSDC (= 20 buys at 0.05 each) + 0.01 0G gas.
bun run --env-file=.env scripts/fund-agent.ts <A> 1.0
```

Verify in the studio: open `/agents/<A>`, the wallet panel should show
**1.0000 mUSDC** + **0.0100 0G** in green.

The producers stay at 0 mUSDC for now — that's the "starting state"
the demo wants to show: the consumer pays, producers earn.

---

## 3. Producer tests (10 min)

Each producer test verifies persona-scoped self-evolution: the agent
recognizes a capability gap, calls `evolve_new_skill`, the persona's
preferred no-auth API gets injected into the codegen prompt, DeepSeek
generates working code, the artifact lands on 0G Storage + on-chain via
SkillRegistry, and the new skill executes for real data in the same
turn.

### 3.1 Researcher — Wikipedia lookup

Open `/agents/<R>/chat`. Send:

```
Forge a wiki.lookup skill that fetches Wikipedia summaries by topic,
then look up Bitcoin.
```

Expected behavior:
1. Agent acknowledges the gap, asks permission OR jumps straight in.
2. **Purple invocation card** appears: `evolve_new_skill` with
   `capabilityTag: "wiki.lookup"`.
3. Server log: `[skill-forge] persona=Researcher → APIs: arXiv API,
   Wikipedia REST, Semantic Scholar, CrossRef`
4. Server log: `forge → publishSkill tx 0x…`
5. **Orange invocation card**: `wiki_lookup` runs.
6. Final reply quotes a real Wikipedia extract about Bitcoin (starts
   *"Bitcoin is the first decentralized cryptocurrency…"*).

What to watch for:
- The skill `extract` field has real prose (not a fallback string).
- A new entry appears in the **memory log** tab: `evolve.success` +
  `skill.published`.
- The **skills** tab shows `wiki.lookup` listed at 0.05 mUSDC.

### 3.2 Trader — crypto price

Open `/agents/<T>/chat`. Send:

```
Forge a price.token skill that fetches the USD price for any crypto
symbol (BTC, ETH, etc), then call it for ETH.
```

Expected:
1. Persona log: `persona=Trader → APIs: CryptoCompare (symbol-based,
   FIRST CHOICE), CoinPaprika, CoinGecko, DeFiLlama`
2. DeepSeek picks **CryptoCompare** (first in the hint list, accepts
   raw symbols).
3. Final reply: *"The current price of ETH is $X,XXX.XX USD."* — real
   number, fluctuates by run.

If you instead see priceUSD: 0, DeepSeek picked CoinGecko's `?ids=`
endpoint without the slug map. The persona hint is structured to push
toward CryptoCompare first; the fallback is a sign that the codegen
prompt needs sharpening.

### 3.3 Writer — Wikipedia summarize (composition angle)

Open `/agents/<W>/chat`. Send:

```
Forge a text.summarize_topic skill that fetches a Wikipedia summary
for any topic via the Wikipedia REST API and returns a one-sentence
headline plus the full extract, then summarize Ethereum.
```

Expected:
1. Persona log: `persona=Writer → APIs: Wikipedia REST, LibreTranslate,
   Direct webpage fetch`
2. DeepSeek picks Wikipedia REST (first preferred API for Writer,
   `https://en.wikipedia.org/api/rest_v1/page/summary/<topic>`).
3. Final reply structured as:
   ```
   Headline: Ethereum: Open-source blockchain computing platform
   Extract: Ethereum is a decentralized blockchain with smart contract
            functionality. Ether is the native cryptocurrency...
   ```

Why this prompt instead of webpage extraction: Wikipedia REST returns
clean structured JSON (`title`, `description`, `extract`). Writer's
forged code is 5-line happy-path, much harder for DeepSeek to typo than
multi-pass HTML tag scanning. Webpage extraction is verified to fail
~50% of runs (DeepSeek emits typo'd variable names like `startArticle`
without declaring them, or generates code with regex literals that
break `new Function()` parse).

The angle is different from Researcher even though both hit Wikipedia:
Researcher fetches the full extract (academic), Writer condenses it to
a headline + extract pair (composition). Both can be sold separately
on the marketplace; the Analyst can buy from either based on what the
user wants.

Skip the LibreTranslate path during demo — that public endpoint is
rate-limited and falls back to "Fallback translation: …" half the time.

---

## 4. Consumer test — Analyst buys from a producer (3 min)

This is the killer demo: agent-to-agent commerce, real mUSDC settles
onchain, royalty distributes via the producer's RoyaltyVault.

### 4.1 Setup

You should now have:
- Researcher #<R> with `wiki.lookup` published
- Trader #<T> with `price.token` published
- Writer #<W> with `web.fetch_extract` published
- Analyst #<A> funded with 1 mUSDC

### 4.2 Analyst buys ETH price

Open `/agents/<A>/chat`. Send:

```
Get me the current ETH price.
```

Expected behavior (follow the chain in the studio):
1. Agent sees the marketplace listing in its system prompt: *"capability:
   "price.token" — owner: iNFT #\<T\> — price: 0.05 mUSDC"*.
2. **Purple invocation card**: `purchase_skill` with capabilityTag
   `price.token` and inputs `{ symbol: "ETH" }`.
3. Server log:
   ```
   [purchase] agent #<A> → price.token (#<T> vault 0x…) for 0.0500 mUSDC
   [purchase] tx submitted: 0x…
   [purchase] tx confirmed via balance poll: 0x…
   ```
4. Reply quotes the real ETH price + the receipt:
   *"I bought price.token from iNFT #\<T\> for 0.05 mUSDC (tx 0x…).
   The current ETH price is $2,XXX.XX USD."*

### 4.3 Analyst buys Wikipedia data

Same agent, send:

```
Get me information about Ethereum from Wikipedia.
```

Expected:
1. `purchase_skill` with `wiki.lookup`, inputs `{ topic: "Ethereum" }`
2. Real Wikipedia extract about Ethereum returned + receipt.

After both purchases, Analyst's mUSDC should have dropped by
**0.10 mUSDC** (2 × 0.05). Verify on the agent profile or via:

```bash
curl -s http://localhost:3700/admin/agent/<A>/wallet | jq '.mUSDC'
# Expected: ~0.90
```

---

## 5. On-chain verification (2 min)

This is the receipts-on-chain story for the demo video.

```bash
# Find the most recent tx hash from the [purchase] log lines and verify
# the transfer + the producer's vault balance increased.

# Researcher's vault now has 0.05 mUSDC (from the wiki.lookup purchase)
RESEARCHER_VAULT=$(curl -s http://localhost:3700/admin/agent/<R>/wallet | jq -r '.address')
# Note: the vault address is DIFFERENT from the agent's signing wallet —
# the vault is the iNFT.agents(tokenId).royaltyVault, which is what
# RECEIVES skill payments. Find it via:
cast call --rpc-url https://evmrpc-testnet.0g.ai \
  0xfe9163ee0a168e30c10c458c3fadf9f8566647fc \
  "agents(uint256)(bytes32,bytes32,bytes32,address,uint64)" <R> \
  | tail -2 | head -1   # 4th tuple field is the vault

# Trader's vault similarly
cast call --rpc-url https://evmrpc-testnet.0g.ai \
  0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5 \
  "balanceOf(address)(uint256)" <TRADER_VAULT_ADDR>
# Should show 50000 (= 0.05 mUSDC at 6 decimals)
```

In the studio's **/dashboard**: the "mUSDC settled" stat should show
**0.10** (real RoyaltyDistributed event scan).

ChainScan-Galileo links to keep open during the demo:
- Producer iNFT vaults (one tx each)
- Analyst's signing wallet (showing two outgoing transfers)
- mUSDC contract (showing the settled events)

---

## 6. What to record for the demo video

Suggested ~3-minute cut:

| Timestamp | What | Where |
|---|---|---|
| 0:00–0:20 | "Four agents on a marketplace, mid-evolution." Pan over the agents list — four cards, four colors. | `/agents` |
| 0:20–0:50 | Trader forges price.token live. Show DeepSeek reasoning, persona log, on-chain tx. | `/agents/<T>/chat` |
| 0:50–1:20 | Researcher forges wiki.lookup the same way. Real Wikipedia data lands. | `/agents/<R>/chat` |
| 1:20–2:10 | Analyst buys both skills. Show the buy receipts, the cyan persona, the wallet drop from 1.00 → 0.90 mUSDC in real time. | `/agents/<A>/chat` |
| 2:10–2:40 | Show the receipts on chainscan + the studio dashboard's settled stat moving. | external + `/dashboard` |
| 2:40–3:00 | Stack: 0G Compute (DeepSeek mainnet), 0G Storage (encrypted artifacts), KeeperHub (every onchain action), x402 + mUSDC (settlement). | architecture slide |

---

## 7. Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Studio shows "qwen-2.5-7b" in chat | Old chat history persisted from testnet runs. Each turn carries its own model name. | Click "clear" in the chat OR send a new message — fresh turns show DeepSeek. |
| Compute pool shows 8 0G | Browser is hitting a stale server (Windows-side bun process from before the mainnet switch) | `netstat -ano \| findstr :3700` → kill old process → restart with new `.env` |
| `priceUSD: 0` | DeepSeek picked CoinGecko + passed raw symbol (CoinGecko wants slugs). Persona hint puts CryptoCompare first to avoid this — if it still happens, regenerate with a stronger explicit prompt. | Re-prompt agent with "use CryptoCompare specifically" |
| `transferReceipt not found` | Viem's `waitForTransactionReceipt` is too aggressive on 0G testnet RPC. | The fund-agent script + purchase_skill both poll balance directly instead. If you see this in fresh code, port the balance-poll pattern. |
| Forge succeeds but skill returns placeholder | Marketplace server's `MEMORY_FILE` isn't pointing at the project root. | Confirm server log line: `[skill-market] memory store: /…/Clawforger/data/agent-memory.json` |
| Analyst forges instead of buying | System prompt isn't matching the Analyst persona. | Confirm agent's stored systemPrompt starts with "You are Analyst" (the detector matches on that phrase). |

---

## 8. Reset between runs

If you want a clean slate to re-record:

```bash
# Wipe per-agent chat history + memory log (preserves on-chain skills)
rm data/agent-memory.json && touch data/agent-memory.json

# Re-fund the Analyst if it's spent down
bun run --env-file=.env scripts/fund-agent.ts <A> 1.0

# Restart server so MEMORY_FILE rebuilds
# (Ctrl+C in marketplace terminal, then re-run)
```

On-chain skills persist forever — the SkillRegistry doesn't have a
"delete" function. So re-running the producer tests against the same
agent will just register a new variant of `wiki.lookup.v2` (or
similar). Mint fresh agents if you want pristine evolution events.

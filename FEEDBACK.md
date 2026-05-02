# Builder Feedback

Honest, actionable feedback from a builder who shipped Clawforger end-to-end during the hackathon. Sections per sponsor.

---

## KeeperHub

> Integration code: `packages/keeperhub-execute/src/mcp-client.ts`
> Wallet integration tested: `0x24Ca59426b6B30E1D6a097B9D1cb48aE8F897d4f`
> Chain tested: 0G Galileo testnet (chainId 16602)
> Server URL: `https://app.keeperhub.com/mcp` (Streamable HTTP transport)

### What worked 🟢

- **MCP HTTP transport setup** was excellent — 5 lines from `bun add @modelcontextprotocol/sdk` to working authenticated session.
- **`ai_generate_workflow`** is genuinely impressive: prompted with *"call mintAgent on contract 0xfe91… (network 16602)…"*, KH's AI produced a valid workflow with `web3/write-contract` action, correct contract address, function selector, arg ordering, and gas hints — first try, ~3 seconds.
- **`list_integrations` + `get_wallet_integration`** were exactly what we needed for the studio UX (showing users which wallet would sign).
- **Tool discovery** via `listTools()` is exhaustive and well-typed — knowing every tool + input schema upfront made integration a 1-day job.
- **0G chain support exists** — both 0G mainnet (16661) and 0G Galileo (16602) appear in the network dropdown when authoring contract calls in the web UI.
- Auto gas estimation + nonce management saved us from the "stuck transaction" class of bugs that always plagues hackathon work.

### Reproducible bugs 🔴

1. **`execute_contract_call` writes never broadcast on 0G — runs sit "Running" indefinitely.**
   Severity: **blocker.** This is worse than a clean failure because it
   pollutes the operator's analytics dashboard with stuck records.

   **Symptom from the user side:** the MCP client receives `MCP error
   -32001: Request timed out` after our 30s outer timeout (or Cloudflare
   524 after 120s if we wait that long).

   **Symptom on the KH side (from the operator's Analytics page at
   `app.keeperhub.com`):** Direct Contract-Call runs accumulate in
   "Running" status forever. We left three runs untouched for ~1 hour and
   they remained Running:

   ```
   Workflow Runs                Status     Source   Network    Time
   ─────────────────────────────────────────────────────────────────
   Contract-Call                Running    Direct   16602      50m ago
     No step logs available
   Contract-Call                Running    Direct   16602      53m ago
     No step logs available
   Contract-Call                Running    Direct   16602      57m ago
     No step logs available
   ```

   No tx ever lands on 0G (verified via chainscan-galileo.0g.ai for the
   KH-managed wallet `0x24Ca59…7d4f`, which had 0.2 0G — gas was not the
   issue). Whatever queue these runs are in either never picks them up or
   silently drops the broadcast without writing back a `failed` status.

   **Repro:**

   ```ts
   // Read returns in <1s ✓
   await c.callTool({ name: 'execute_contract_call', arguments: {
     contract_address: '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5', // mUSDC
     network: '16602',
     function_name: 'balanceOf',
     function_args: '["0xD0c5cCB47FDf06DA8Bd01A0Cf087C4A34c27b685"]',
   }}); // ← 784 ms

   // Write hangs forever (or 524s after 120s) ✗
   await c.callTool({ name: 'execute_contract_call', arguments: {
     contract_address: '0xfe9163ee0a168e30c10c458c3fadf9f8566647fc', // ClawforgerINFT
     network: '16602',
     function_name: 'mintAgent',
     function_args: '["0xD0c5...", "0x...", "0x..."]',
     abi: '...',
     priority_fee_gwei: '2',
   }}, undefined, { timeout: 150_000 });
   // → MCP error -32001 (or Cloudflare 524 after 120s)
   // → KH dashboard: run sits in "Running" forever, never broadcasts
   ```

   **Suggested fixes (not mutually exclusive):**
   - Return `execution_id` *immediately* after submission so clients can
     poll asynchronously without holding the HTTP connection.
   - Add a worker-level circuit breaker that flips runs to `failed` after
     N seconds of no chain activity, with `error: "tx-never-broadcast"`.
   - Audit the chain-16602 broadcaster path in your queue system —
     something in the 0G-Galileo lane is dropping work without alerting.

   **Workaround we shipped:** chain-aware blocklist
   (`DIRECT_EXEC_BLOCKLIST = {16602, 16661}`). On 0G chains we skip
   `execute_contract_call` entirely after `ai_generate_workflow` runs.
   Other chains keep using the direct path. See `submitAndRun` in
   `packages/keeperhub-execute/src/mcp-client.ts`. We'll lift the
   blocklist as soon as KH confirms 0G writes broadcast reliably.

2. **Default MCP request timeout (30s SDK default) is too short for write tools.**
   The TS SDK's `DEFAULT_REQUEST_TIMEOUT_MSEC` is 30s. KH's write-class
   tools regularly exceed that even on healthy chains. Either:
   - set a `_meta.suggestedTimeout` MCP hint per tool (the MCP spec
     supports per-tool metadata) so clients can pick a sane default;
   - or document in `docs.keeperhub.com/ai-tools/mcp-server` that callers
     should pass `{ timeout: 120_000, resetTimeoutOnProgress: true }` for
     write-class operations.

3. **`ai_generate_workflow` returns JSONL operations, not a saved workflow.**

   ```js
   // Tool returns:
   { result: '{"type":"operation","operation":{"op":"setName","name":"..."}}\n' +
             '{"type":"operation","operation":{"op":"addNode","node":{...}}}\n' +
             '...' }
   ```

   To save the result you have to parse JSONL, then call `create_workflow`,
   then somehow apply each `addNode`/`addEdge` op (no obvious bulk endpoint).
   **Suggested fix:** add an `applyOperations: true` parameter to
   `ai_generate_workflow` that creates and populates the workflow in one
   call and returns `workflowId`. Or expose `apply_workflow_operations`
   that takes the ops + an optional `workflowId`.

### Documentation gaps 🟡

1. **0G chain support not in docs.** The web UI's chain dropdown lists
   *0G* (16661) and *0G Galileo* (16602) but `https://docs.keeperhub.com/`
   only enumerates *"Ethereum, Base, Arbitrum, Polygon, Sepolia"* plus
   *"additional EVM-compatible networks"*. We pivoted our architecture
   twice before checking the platform UI.
   **Request:** publish the exhaustive chain list (mainnet + testnet) on
   the `Networks` docs page with `chainId`, RPC mode (private/public),
   and any per-chain quirks (e.g. *"0G testnet requires `priority_fee_gwei`
   ≥ 2"*).

2. **Bearer + X-API-Key auth ambiguity.** The MCP endpoint accepts both
   `Authorization: Bearer kh_…` and `X-API-Key: kh_…`. We send both
   because we couldn't tell from docs which the gateway prefers. Pick
   one and document it.

### Feature requests 🟢

1. **`get_wallet_balance` MCP tool** for the configured wallet integration
   on a given chain. We had to fall through to viem `getBalance` to
   diagnose item #1. Same idea as `get_wallet_integration` but returns
   on-chain balance.

2. **`execute_contract_call_async`** (or an `async: true` flag on the
   existing tool) — return `execution_id` immediately, never block past
   submission. Direct path mirroring `execute_workflow`.

3. **MCP progress notifications during `execute_contract_call`** — once
   write ops are async, streaming progress (`submitted` → `mempool` →
   `confirmed`) keeps long-poll clients alive via `resetTimeoutOnProgress`.

4. **Idempotency keys** on `create_workflow` and `execute_contract_call`.
   When an agent retries due to a network blip, we get duplicate workflow
   shells / executions. An `Idempotency-Key: <agent-tx-id>` header that
   returns the existing record on repeat would prevent duplicates.

5. **Conditional retry policies** in workflow config: `retryOnRevertReason`
   + `retryUnless: <regex>` so we can short-circuit retries on permanent
   failures (e.g. "ERC721: invalid token ID").

6. **MCP resource `keeperhub://integrations/{id}/balance/{chainId}`** — a
   pull-shape alternative to the proposed `get_wallet_balance` tool.

---

## x402

### What worked

- The HTTP 402 + payment-spec pattern is the right primitive. Built our facilitator in ~150 LOC.
- EIP-712 typed-data signing matches existing wallet UX so signing the payment is one click.

### What didn't / gap

**There is no public x402 facilitator on 0G chain.** The Coinbase x402 facilitator targets Base. We had to ship our own (`@clawforger/x402-facilitator`) for Clawforger to work end-to-end on 0G Galileo. This is fine for a hackathon, but it means every project that wants to use x402 outside Base/Solana has to write a facilitator from scratch. **Request:** an official reference facilitator implementation that's chain-agnostic + community-runnable, plus a community registry of facilitator URLs per chain.

### Feature requests

1. **Standard JSON Schema for the 402 response body.** Different implementations subtly differ on field naming (e.g. `maxAmountRequired` vs `amount`).
2. **Multi-asset support in `accepts[]`.** A merchant should be able to accept either USDC or mUSDC. Today I have to pick one.
3. **`extra.facilitator` URL field is ad-hoc** — formalize it.

---

## 0G

### What worked

- ERC-7857 is the right abstraction for AI agents. Encrypted private metadata + dynamic updates are exactly what we need.
- 0G Galileo testnet RPC stayed up the whole hackathon — appreciated.
- **Aristotle mainnet Compute is excellent.** DeepSeek V3, GLM-5/5.1, gpt-5.4-mini, qwen3.6-plus all served via the same broker SDK. TEE-verified `processResponse(chatID)` returns `VALID` reliably. Pricing is fair (DeepSeek V3 ≈ 2.7 µ0G per output token, the cheapest agent-grade option). We default to DeepSeek for codegen and it nails `new Function()`-parseable JS first try ~90% of the time.
- The package rename from `@0glabs/0g-serving-broker` to `@0gfoundation/0g-compute-ts-sdk` was clean — old name still re-exports.

### Reproducible bugs / SDK quirks 🔴

1. **`broker.ledger.transferFund(addr, 'inference', 1)` throws "Invalid mix of BigInt and other type in division" under Bun.**
   The SDK accepts a number argument per the documented examples, but the internal pricing math mixes BigInt with regular numbers somewhere on the path under Bun runtime. Fails with:
   ```
   error: Invalid mix of BigInt and other type in division.
       at throwFormattedError (.../@0gfoundation/0g-compute-ts-sdk/lib.esm/index-33b65b9f.js:14725:28)
   ```
   **Workaround that works**: pass the amount in **neuron units as BigInt** instead — e.g. `BigInt(10) ** BigInt(18)` for 1 0G. See `scripts/fund-provider.ts` for our BigInt-safe variant.
   **Suggested fix**: normalize the argument early (accept `number | bigint`), or document the BigInt-only path for Bun explicitly in the README.

2. **`acknowledgeProviderSigner` emits a noisy `InsufficientAvailableBalance` error every chat call** even when balances are healthy.
   ```
   [zg-compute] provider ack skipped: Error: InsufficientAvailableBalance
       (Arg0: 999999999999999999, Arg1: 10000000000)
   ```
   Arg0 is what we have, Arg1 is what's being asked for — Arg1 is *much smaller* than Arg0 (1e10 vs 1e18 = 10 GWei vs 1 ETH-equivalent), so the error feels reversed. Subsequent chat call succeeds anyway, so it's cosmetic, but it pollutes server logs and makes operators chase a phantom funding bug.

3. **No SDK retry / receipt-polling helper.**
   `eth_getTransactionReceipt` calls on Galileo testnet RPC are slow — viem's `waitForTransactionReceipt` regularly times out at the default 180s even though the tx ultimately mines. We polled the buyer's mUSDC balance for a drop as a workaround, which has a critical false-positive: concurrent buys cause the balance to drop below threshold from a *different* tx, and the poll falsely confirms the *current* one. Fixed in our code by manually polling `eth_getTransactionReceipt(hash)` for that specific hash with a 2s interval.
   **Suggested fix**: ship `broker.utils.waitForReceipt(hash, { timeoutMs, pollMs })` as an SDK helper that handles the testnet RPC's idiosyncrasies.

### Mainnet ecosystem gaps 🟡

1. **No canonical USD stablecoin on Aristotle.** Not in [Circle's 28-chain native USDC list](https://developers.circle.com/stablecoins/usdc-contract-addresses). Not on [LayerZero V2 deployed endpoints](https://docs.layerzero.network/v2/deployments/deployed-contracts) — so no Stargate / USDT0 bridge route. No 0G ecosystem partner deployment ([0g.ai/partners](https://0g.ai/partners)). Zero references to USDC/USDT/DAI in [docs.0g.ai](https://docs.0g.ai).
   The result: a dApp can deploy contracts to Aristotle but every project ends up shipping their own mock token for settlement, which is exactly what we already had on testnet. We deliberately ship Clawforger as **inference on Aristotle, contracts on Galileo** for this reason — and document the rationale in ARCHITECTURE.md ("The hybrid mainnet/testnet posture") so judges understand it's a deliberate posture, not "we ran out of time."
   **Request**: 0G should pursue Circle CCTP + native USDC, OR partner with LayerZero / Wormhole to bridge USDC, OR endorse a stablecoin in the ecosystem partners list. Without USDC, mainnet is hard to monetize.

2. **0G Aristotle chainId + RPC weren't in `docs.0g.ai`** when I checked. Found via ChainList. Easy fix.

### Documentation gaps

1. **No public reference implementation of ERC-7857.** I implemented the load-bearing semantics directly (encrypted intelligence pointer + ERC-4906 metadata update + secure-transfer hook) but a canonical OZ-style reference would save every team a few hours.
2. **0G Storage SDK quickstart for Bun is missing.** I wrote my own thin wrapper (`FileBackedZGStorage` implementing `ZGStorageClient`) so I could swap implementations.
3. **0G Compute broker → Bun integration example.** The docs cover Node + Python; Bun-specific gotchas (BigInt / `transferFund`) deserve a dedicated section.
4. **No service-catalog discovery hint in the docs.** The Aristotle broker exposes 8 services (DeepSeek V3, GLM-5/5.1, gpt-5.4-mini, qwen3.6-plus, qwen3-vl-30b, whisper, z-image) but there's no static doc table — you have to call `listService()` at runtime to discover them. We added `scripts/probe-mainnet.ts` to make this easy. Publishing a periodically-refreshed catalog page would help builders pick a model up-front.

### Feature requests

1. **Block explorer support for ERC-7857 events.** ChainScan-Galileo currently doesn't decode `AgentEvolved`, `AgentMinted`, or `MetadataUpdate` events. Adding ABI uploads or auto-recognition of ERC-7857 contracts would help judges + users.
2. **TEE attestation in 0G Compute responses as a header** so we can surface the proof in the Studio UI without a second round-trip to `processResponse`.
3. **`broker.inference.getActiveProvider()` / discovery API.** Right now consumers iterate `listService()` and substring-match against a hint. Returning a structured catalog with model class tags (`agent-grade`, `vision`, `embedding`, `audio`) would make programmatic selection more robust.
4. **A canonical ERC-7857 + RoyaltyVault factory** as an OZ-style template package. Every iNFT-marketplace project will need both.

---

## Stack-level note

Cross-sponsor friction: **the lack of a unified "agent ID across sponsors" convention.** A Clawforger agent is an iNFT (0G), has a wallet (any EVM), needs an x402 paying account, and registers with KeeperHub. We had to invent the gluing convention ourselves. A shared `agentic-id` standard across 0G + KeeperHub + x402 would dramatically reduce integration friction.

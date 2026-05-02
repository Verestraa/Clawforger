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

1. **`execute_contract_call` 524s on 0G *writes* (reads work fine).**
   Severity: **blocker for our primary execution path.**

   ```ts
   // Read returns in <1s ✓
   await c.callTool({ name: 'execute_contract_call', arguments: {
     contract_address: '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5', // mUSDC
     network: '16602',
     function_name: 'balanceOf',
     function_args: '["0xD0c5cCB47FDf06DA8Bd01A0Cf087C4A34c27b685"]',
   }}); // ← 784 ms

   // Write 524s after 120s ✗
   await c.callTool({ name: 'execute_contract_call', arguments: {
     contract_address: '0xfe9163ee0a168e30c10c458c3fadf9f8566647fc', // ClawforgerINFT
     network: '16602',
     function_name: 'mintAgent',
     function_args: '["0xD0c5...", "0x...", "0x..."]',
     abi: '...',
     priority_fee_gwei: '2',
   }}, undefined, { timeout: 150_000 });
   // → Streamable HTTP error: 524 Cloudflare timeout, origin > 120s
   ```

   The KH origin appears to wait synchronously for full receipt before
   responding, blowing past Cloudflare's 120s proxy-read window on chains
   with finality > ~30s. KH-managed wallet was funded (0.2 0G — verified
   via 0G explorer), so this is not gas-related.

   **Suggested fix:** make `execute_contract_call` return `execution_id`
   *immediately* after submitting to the wallet integration's mempool,
   then let clients poll `get_direct_execution_status` for the receipt.
   The async shape already exists for workflows — mirroring it here would
   unblock all chains with finality > 30s.

   **Workaround we shipped:** layered flow that always calls
   `ai_generate_workflow` first (visible MCP integration evidence,
   completes in ~3s), tries `execute_contract_call` with a 30s outer
   timeout, then falls through to viem with KH-shaped retry semantics
   for the actual broadcast. See `submitAndRun` in our MCP client.

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

### Documentation gaps

1. **No public reference implementation of ERC-7857.** I implemented the load-bearing semantics directly (encrypted intelligence pointer + ERC-4906 metadata update + secure-transfer hook) but a canonical OZ-style reference would save every team a few hours.
2. **0G Storage SDK quickstart for Bun is missing.** I wrote my own thin wrapper (`InMemoryZGStorage` + `RealZGStorageClient` interface) so I could swap implementations.
3. **0G Compute broker → Bun integration example.** The docs cover Node + Python; Bun-specific workings of `@0glabs/0g-serving-broker` would help.

### Feature requests

1. **Block explorer support for ERC-7857 events.** ChainScan-Galileo currently doesn't decode `AgentEvolved` or `MetadataUpdate` events. Adding ABI uploads or auto-recognition of ERC-7857 contracts would help judges + users.
2. **TEE attestation in 0G Compute responses as a header** so we can surface the proof in the Studio UI.
3. **0G Aristotle mainnet chainId + RPC** — confirm the canonical values in docs.

---

## Stack-level note

Cross-sponsor friction: **the lack of a unified "agent ID across sponsors" convention.** A Clawforger agent is an iNFT (0G), has a wallet (any EVM), needs an x402 paying account, and registers with KeeperHub. We had to invent the gluing convention ourselves. A shared `agentic-id` standard across 0G + KeeperHub + x402 would dramatically reduce integration friction.

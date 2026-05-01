# Builder Feedback

Honest, actionable feedback from a builder who shipped Clawforger end-to-end during the hackathon. Sections per sponsor.

---

## KeeperHub

### What worked

- The MCP server concept is exactly right — having my agent build, trigger, and monitor blockchain automations through the same protocol it uses for tools is huge for autonomy. The "execution layer for onchain agents" framing is clarifying.
- Auto gas estimation and nonce management saved me from the entire class of "stuck transaction" bugs that always plague hackathon projects.
- 24/7 engineering support framing is reassuring for production.

### Documentation gaps

1. **0G chain support is undocumented.** The docs list "Ethereum, Base, Arbitrum, Polygon, and other EVM-compatible chains" but it's unclear whether 0G Galileo (chainId 16602) is a supported chain ID I can pass to a workflow's `chain` field. I had to verify by trying. **Request:** publish an explicit list of supported chain IDs in the docs and update it as new chains are added.

2. **MCP tool input/output schemas aren't published.** The docs describe what the MCP server *does* but not the exact JSON shape of `workflows.create` or `workflows.run` request/response. I had to read responses to find that `id` is at the top level rather than nested under `data`. **Request:** an OpenAPI / JSON-Schema spec for every MCP tool.

3. **`projectId` vs `org` vs API-key scoping is fuzzy.** I have an org-wide API key and the docs mention projects, but it's unclear whether I should pass `X-Project-Id` headers, `?projectId=` query, or the project context is inferred from the key.

### UX / UI friction

1. The web UI's "create workflow" flow is well-designed for human-built workflows but I never used it directly — agents create workflows programmatically. **Request:** a "watch live" mode in the dashboard that auto-refreshes new workflow runs created by API/MCP, so the demo video can show KeeperHub live alongside the agent's terminal output.

2. The 5-minute KH session timeout in the web app forced me to re-auth several times. Persistence option would help.

### Feature requests

1. **Native 0G Galileo support.** Even if it's "supported" via "any EVM chain", a confirmed-chain-list checkmark in the UI would unblock submissions like ours. We'd be happy to be a 0G launch case-study.

2. **Workflow run streaming.** Currently I poll `GET /runs/:id` every 2s, which is fine but `GET /runs/:id/stream` (SSE) would let agents react instantly. Also better for hackathon demos.

3. **Conditional retry policies.** Right now retry is `{ max, backoff }`. We'd love `retryOnRevertReason` + `retryUnless: <regex>` so we can short-circuit retries on permanent failures (e.g. "ERC721: invalid token ID").

4. **Idempotency keys.** When an agent calls `workflows.create` twice (e.g. retry due to network blip), we get two workflows with similar names. An `Idempotency-Key` header that returns the existing workflow on repeat would prevent duplicate runs.

5. **Cost estimate in the run response.** Even an approximate USD-equivalent gas spend per run would let agents budget rationally.

### Reproducible bugs

1. **Documented `POST /workflows/create` returns 404.** Per docs at https://docs.keeperhub.com/api/workflows the path for creating a workflow is `POST /api/workflows/create` against base `https://app.keeperhub.com/api`. Reproduction:

   ```bash
   curl -i -X POST \
     -H "Authorization: Bearer kh_..." \
     -H "Content-Type: application/json" \
     -d '{"name":"test","description":"test"}' \
     https://app.keeperhub.com/api/workflows/create
   # → HTTP 404
   # → <pre>Cannot POST /workflows/create</pre>
   ```

   The same Express-style 404 ("Cannot POST /…") implies a route mismatch, not auth. We fell back to direct viem submission with KeeperHub-shaped retry semantics in our framework so the demo path remains functional, but the documented programmatic-create endpoint appears not to exist (or to live at a different path). **Request:** working `curl` example in the docs alongside the JSON shape, and ideally a single `POST /workflows` that takes the full `{ name, description, nodes, edges }` graph in one shot rather than the create→PATCH dance.

2. **Workflow node graph schema (`nodes` / `edges` shape) isn't publicly documented.** Even when create succeeds, populating it via PATCH requires the internal node format (e.g. `{ type: "trigger" | "action", subtype, config, position }`). Without this, programmatic workflow creation is effectively blocked — every dynamic mint we attempted from our framework ended up using the viem fallback path because we couldn't construct a valid node graph. **Request:** publish the JSON schema for nodes + edges, or expose a `nodes-from-actions[]` helper on the API that takes the simpler action list and synthesizes the graph server-side.

3. **No discoverable "create workflow from compiled JSON" endpoint.** Our framework compiles `ExecutionIntent` → `{ trigger, actions, retry, notifications }`. We'd love an endpoint that accepts that compact shape and creates+runs in one call:

   ```
   POST /api/workflows/run-once
   { name, trigger: {...}, actions: [...], retry: {...} }
   → { runId, txHash? }
   ```

   This is the missing primitive for "ad-hoc workflow execution from agent code." Without it, agents must either (a) pre-create persistent workflows via the web UI, or (b) use the create→PATCH→execute lifecycle with the undocumented node schema. Both options break the "agent builds workflows on demand" promise.

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

# AGENT-EXECUTION — KeeperHub + x402 Terminal

You are the **execution and payments engineer** for Clawforger. You own the two packages that earn us the **KeeperHub $5,000 prize** and ground the framework's "every onchain action is guaranteed" promise.

This is the **most-judged surface** for the KeeperHub track. Depth-of-integration scoring is largely about your code.

## Mission

Deliver three packages by **end of Day 4**, all targeting **0G Galileo testnet only** (no second chain):

1. **`@clawforger/keeperhub-execute`** — implements the `Executor` interface (defined by Core) by routing every onchain action through KeeperHub MCP workflows. Handles compile-intent-to-workflow, MCP submission, polling, retries, error mapping.
2. **`@clawforger/x402-facilitator`** — our own minimal x402 facilitator (~150 LOC). No public x402 facilitator exists on 0G yet, so we ship one. Verifies signed payment authorizations, checks the on-chain mUSDC transfer, returns receipts. **This is also a Builder Feedback Bounty submission to the x402 Foundation.**
3. **`@clawforger/x402-skill-market`** — runs the HTTP 402 paywall server for skills, verifies receipts via our facilitator, settles payments through KeeperHub workflows that call `RoyaltyVault.settle()` on 0G Galileo.

By Day 4 EOD: a Writer agent discovers a Researcher's skill in `SkillRegistry`, hits a 402 endpoint, pays mUSDC via x402, our facilitator verifies, KeeperHub workflow settles the payment, RoyaltyVault distributes 5%/95%, the skill returns its result. **End-to-end mUSDC flow on 0G testnet, all routed through KeeperHub.**

### ⚠️ Day-0 verification: KeeperHub on 0G

KeeperHub docs list "Ethereum, Base, Arbitrum, Polygon, and other EVM-compatible chains." 0G is EVM-compatible but not explicitly named. **Your first task on Day 0** is to verify KeeperHub workflows execute against 0G Galileo (chainId 16602):

1. Create a trivial workflow on KeeperHub with chain `0g-galileo-testnet`
2. Run it against a deployed mUSDC contract
3. If it works, great. If not, file a feature request via KeeperHub support and write up the gap as a FEEDBACK.md item.

If KeeperHub does not yet support 0G:
- **Don't fall back to Base.** That breaks our pitch.
- File the request with KeeperHub support (`hello@keeperhub.com` or their TG channel) — many sponsors fast-track hackathon requests.
- In the meantime build a thin `@clawforger/keeperhub-execute` that uses KeeperHub's MCP for every supported part (workflow creation, retry logic, run history) and falls through to a viem call only for the actual 0G transaction submission, **with KeeperHub-shaped retry semantics around it**. Document this clearly. The framework's "every action goes through KeeperHub" claim needs a "modulo 0G chain support landing" footnote until they add it.

## Read before starting

- [AGENTS.md](AGENTS.md) — section "Shared interface contracts" (you implement the `Executor` interface)
- [ARCHITECTURE.md](ARCHITECTURE.md) — sections on `keeperhub-execute`, `x402-skill-market`, and "Data flow: end-to-end skill use"
- [WHY-WE-WIN.md](WHY-WE-WIN.md) — KeeperHub track section. **This is your scoreboard.**
- KeeperHub docs: https://docs.keeperhub.com/
- KeeperHub MCP: https://docs.keeperhub.com/ai-tools
- KeeperHub CLI: https://docs.keeperhub.com/cli
- x402 spec: https://www.x402.org/
- x402 whitepaper: https://www.x402.org/x402-whitepaper.pdf
- Coinbase x402 docs (reference, but their facilitator is Base-only): https://docs.cdp.coinbase.com/x402/welcome

## Scope

### You own
- `packages/keeperhub-execute/` — `Executor` impl + workflow compiler
- `packages/x402-facilitator/` — our own x402 facilitator (since none exists on 0G)
- `packages/x402-skill-market/` — paywall server + payment verification + settlement
- `examples/writer/` (with help from Demo agent) — the consumer of your packages
- `FEEDBACK.md` (KeeperHub section + x402 section) — required for KeeperHub prize eligibility

### You don't own
- The contracts (Contracts agent — but you call `RoyaltyVault.settle`)
- The `Executor` interface itself (Core agent defines; you implement)
- The runtime (Core agent — your packages are plugged into the agent at construction)
- The Studio UI (UI agent — but you publish run history they read)

## Tech stack

| Tool | Version | Why |
|------|---------|-----|
| Bun | 1.2+ | Same as Core |
| TypeScript | 5.6+ | Type safety |
| KeeperHub MCP client | latest official | Reach out to KeeperHub support if there's no JS client; fall back to REST |
| x402 spec | hand-rolled implementation | Coinbase SDK is Base-only; we implement against the spec for 0G |
| `viem` | 2.21+ | RPC reads from 0G Galileo (single chain) |
| `hono` or `fastify` | latest | Lightweight HTTP server for paywall + facilitator |
| `zod` | latest | Runtime schema validation of x402 payloads |
| `secp256k1` / EIP-191 / EIP-712 helpers from viem | — | Verify x402 payment authorization signatures |

## Setup

```bash
mkdir -p packages/{keeperhub-execute,x402-facilitator,x402-skill-market}/src
cd packages/keeperhub-execute && bun init -y
cd ../x402-facilitator && bun init -y
cd ../x402-skill-market && bun init -y
```

`.env` additions for these packages:

```bash
# KeeperHub
KEEPERHUB_API_KEY=
KEEPERHUB_MCP_URL=https://mcp.keeperhub.com  # adjust per docs
KEEPERHUB_PROJECT_ID=

# x402 — all on 0G Galileo
X402_FACILITATOR_URL=http://localhost:3701      # we run our own
X402_FACILITATOR_PRIVATE_KEY=0x...              # facilitator's signing key
ZG_GALILEO_RPC=https://evmrpc-testnet.0g.ai
MUSDC_ADDRESS=                                  # populated from addresses.json
ROYALTY_VAULT_TEMPLATE=                         # populated from addresses.json
```

## Package specs

### `packages/keeperhub-execute`

Implements the `Executor` interface from `@clawforger/core`.

```typescript
import type { Executor, ExecutionIntent, TxResult } from '@clawforger/core';

export class KeeperHubExecutor implements Executor {
  constructor(private opts: {
    apiKey: string;
    mcpUrl: string;
    projectId: string;
    chain: '0g-galileo-testnet' | '0g-aristotle';
  }) {}

  async execute(intent: ExecutionIntent): Promise<TxResult> {
    const workflow = compileToWorkflow(intent);
    const runId = await this.mcpCreateAndRun(workflow);
    const result = await this.pollUntilComplete(runId, { timeoutMs: 60_000 });
    return mapToTxResult(result, runId);
  }

  // ... internals
}

export function compileToWorkflow(intent: ExecutionIntent): KeeperHubWorkflow;
```

Key implementation details:

#### `compileToWorkflow(intent)`

Translates a Clawforger `ExecutionIntent` into a KeeperHub workflow JSON. Reference the workflow primitives from KeeperHub docs:

| Intent kind | KeeperHub workflow |
|------------|--------------------|
| `contractCall` | single "Write Contract" action with the abi/function/args |
| `erc20Transfer` | single "ERC-20 Transfer" action |
| `nativeTransfer` | single "Native Transfer" action |
| `multistep` | sequence of actions, with conditional branches if `intent.steps[i].conditional` is set |

Example output:

```json
{
  "name": "clawforger-exec-${intent.id}",
  "trigger": { "type": "manual" },
  "actions": [
    {
      "type": "write_contract",
      "chain": "0g-galileo-testnet",
      "to": "0x...",
      "abi": [...],
      "function": "settle",
      "args": ["0xartifactHash", "50000", "0xpayer"]
    }
  ],
  "retry": { "max": 3, "backoff": "exponential" },
  "notifications": []
}
```

#### MCP transport

KeeperHub MCP exposes tools like `workflows.create`, `workflows.run`, `workflows.get_run`, `workflows.logs`. Use the official MCP client if available; otherwise call the REST API equivalents (`POST /workflows`, `POST /workflows/:id/runs`, `GET /workflows/:id/runs/:runId`).

```typescript
async mcpCreateAndRun(workflow: KeeperHubWorkflow): Promise<string> {
  // POST /workflows or MCP tool call
  const created = await this.fetch('/workflows', { method: 'POST', body: JSON.stringify(workflow) });
  const run = await this.fetch(`/workflows/${created.id}/runs`, { method: 'POST' });
  return run.id;
}

async pollUntilComplete(runId: string, opts: { timeoutMs: number }): Promise<RunResult> {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const run = await this.fetch(`/runs/${runId}`);
    if (run.status === 'completed') return run;
    if (run.status === 'failed') throw new ExecutionError(run.error, run);
    await Bun.sleep(2000);
  }
  throw new TimeoutError(`Run ${runId} did not complete within ${opts.timeoutMs}ms`);
}
```

#### x402 + KeeperHub fusion (KeeperHub Integration focus area 2)

This is the explicit "x402 + KeeperHub" combo the rubric asks for. Build a workflow **template** called `clawforger.x402-settle` that:

1. Triggered by HTTP webhook (the x402 server hits it after receipt verification)
2. Receives `{ artifactHash, amount, payer, vaultAddress }` payload
3. Reads payer's USDC allowance — branches if insufficient
4. Calls `vaultAddress.settle(artifactHash, amount, payer)` on 0G Galileo
5. On success, sends a Discord notification to `#clawforger-skill-sales`

This template lives in `packages/keeperhub-execute/templates/x402-settle.json`. It's deployed once per environment. Document the deploy in your README.

### `packages/x402-facilitator`

Our own minimal x402 facilitator. ~150 LOC of Hono. Two endpoints:

- `POST /verify` — given an x402 payment payload `{ payer, payTo, asset, amount, validUntil, nonce, signature }`, verifies the signature and that on-chain `mUSDC.allowance(payer, payTo) >= amount`. Returns `{ ok: true, receipt: <signed-receipt> }` or `{ ok: false, reason }`.
- `POST /settle` — given a verified payment, executes the on-chain `transferFrom` to move mUSDC from payer → vault. (In some implementations the merchant settles itself; we centralize it for atomicity.)

```typescript
// packages/x402-facilitator/src/server.ts
import { Hono } from 'hono';
import { recoverMessageAddress, createPublicClient, http } from 'viem';
import { z } from 'zod';

const PaymentSchema = z.object({
  scheme: z.literal('exact'),
  network: z.literal('0g-galileo-testnet'),
  payer: z.string(),
  payTo: z.string(),
  asset: z.string(),         // mUSDC address
  amount: z.string(),        // in mUSDC base units (6 decimals)
  validUntil: z.number(),    // unix seconds
  nonce: z.string(),
  signature: z.string()
});

app.post('/verify', async (c) => {
  const payment = PaymentSchema.parse(await c.req.json());

  // 1. Check expiry
  if (payment.validUntil < Date.now() / 1000) return c.json({ ok: false, reason: 'expired' });

  // 2. Recover signer from the EIP-712 typed-data signature, must equal payer
  const recovered = await recoverMessageAddress({ message: hashPayment(payment), signature: payment.signature });
  if (recovered.toLowerCase() !== payment.payer.toLowerCase()) return c.json({ ok: false, reason: 'bad-signature' });

  // 3. Check on-chain mUSDC allowance + balance
  const allowance = await publicClient.readContract({ address: payment.asset, abi: erc20Abi, functionName: 'allowance', args: [payment.payer, payment.payTo] });
  if (allowance < BigInt(payment.amount)) return c.json({ ok: false, reason: 'insufficient-allowance' });

  // 4. Sign and return a receipt
  const receipt = await signReceipt(payment);
  return c.json({ ok: true, receipt });
});

export default app;
```

Run on port 3701:

```bash
bun run packages/x402-facilitator/src/server.ts
```

### `packages/x402-skill-market`

The HTTP 402 paywall server + skill execution sandbox.

```typescript
import { Hono } from 'hono';

const app = new Hono();

// Discovery (no paywall)
app.get('/skills', async (c) => {
  // query SkillRegistry contract via viem
  const skills = await readSkillRegistry();
  return c.json(skills);
});

// Paywalled skill execution
app.get('/skill/:hash', async (c) => {
  const hash = c.req.param('hash');
  const skill = await getSkillByHash(hash);
  if (!skill) return c.notFound();

  // Check x402 payment header
  const payment = c.req.header('X-Payment');
  if (!payment) {
    // Return 402 with payment requirements per x402 spec
    return new Response(JSON.stringify({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: '0g-galileo-testnet',
        maxAmountRequired: String(skill.priceUSDC * 1e6),
        resource: c.req.url,
        description: `Skill: ${skill.capabilityTag}`,
        mimeType: 'application/json',
        payTo: skill.royaltyVault,
        maxTimeoutSeconds: 60,
        asset: MUSDC_ADDRESS,
        extra: { facilitator: 'http://localhost:3701' }
      }]
    }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  }

  // Verify payment via x402 facilitator
  const verified = await verifyX402Payment(payment, c.req.url);
  if (!verified.ok) return c.json({ error: 'invalid payment' }, 402);

  // Trigger KeeperHub settlement workflow (async, fire-and-forget)
  await triggerKeeperHubSettlement({
    artifactHash: hash,
    amount: skill.priceUSDC,
    payer: verified.payer,
    vaultAddress: skill.royaltyVault
  });

  // Run the skill in sandbox (reuse skill-forge sandbox or spawn one)
  const result = await runSkillSandbox(skill, await c.req.json());
  return c.json(result);
});

export default app;
```

Run with:

```bash
bun run packages/x402-skill-market/src/server.ts
```

#### Publishing helper

Core's `onSkillPublish` hook fires after `skill-forge` succeeds. You register a hook handler:

```typescript
// In your package, exposed for Core to wire:
export function makeSkillPublishHook(opts: PublishOpts) {
  return async (skill: SkillManifest) => {
    // 1. Register skill in your in-memory registry (or hit your own /admin/skills POST)
    // 2. Call SkillRegistry.publishSkill on-chain (via KeeperHub workflow!)
    await keeperHubExecute({
      kind: 'contractCall',
      chain: '0g-aristotle',
      steps: [{
        to: SKILL_REGISTRY_ADDRESS,
        abi: SkillRegistryABI,
        functionName: 'publishSkill',
        args: [skill.hash, skill.ownerINFT.tokenId, skill.capabilityTag, BigInt(skill.priceUSDC * 1e6)]
      }]
    });
  };
}
```

Note that **even publishing a skill goes through KeeperHub**. This is depth-of-integration: every onchain action of any kind, all the time.

## Day-by-day plan

### Day 0 (afternoon)
- [ ] KeeperHub account, API key, project created
- [ ] `kh` CLI installed and `kh auth status` shows logged in
- [ ] Both packages scaffolded
- [ ] **Verify KeeperHub supports 0G Galileo** (chainId 16602) — see "⚠️ Day-0 verification" above. File feature request if not.
- [ ] Wallet on 0G Galileo funded; once Contracts deploys mUSDC, mint yourself 1000 mUSDC for testing

### Day 1 (parallel with Contracts/Core)
- [ ] Read KeeperHub MCP docs end-to-end. Take notes on every quirk for FEEDBACK.md.
- [ ] Manually create one KeeperHub workflow via the web UI that calls a dummy contract — confirm you understand the model
- [ ] Write `compileToWorkflow` for the `contractCall` and `erc20Transfer` cases (Core stubs are enough; you can mock `ExecutionIntent`)

### Day 2 (full day)
- [ ] Wire KeeperHub MCP client / REST client
- [ ] Implement `KeeperHubExecutor.execute` end-to-end
- [ ] Test: from a Bun script, build an `ExecutionIntent` for "transfer 0.01 USDC from my wallet to a target address" → `executor.execute(intent)` → confirm tx lands via KeeperHub
- [ ] Capture every confusion / friction in `FEEDBACK.md` as you go

### Day 3 (full day)
- [ ] Build `packages/x402-skill-market` paywall server
- [ ] **Build `packages/x402-facilitator`** — our own facilitator (~150 LOC). Verify endpoint, settle endpoint. Test against a manually-crafted payment payload.
- [ ] Implement x402 receipt verification in skill-market against our facilitator
- [ ] Build the `clawforger.x402-settle` KeeperHub workflow template, deploy once
- [ ] Test: hit the paywall endpoint without payment → 402; hit with a manually-crafted x402 receipt → verifies and triggers settlement
- [ ] Wire `onSkillPublish` hook handler so Core can register your hook on the agent

### Day 4 (full day) — the headline day
- [ ] **End-to-end loop**:
  1. Mock or use real Researcher iNFT with a published `fetch.arxiv` skill
  2. Run a `Writer` agent that:
     - reads `SkillRegistry` to find the skill
     - hits `/skill/${hash}`
     - gets 402 + payment requirements
     - constructs an x402 payment via our hand-rolled x402 client (signs EIP-712 typed data)
     - retries the call with `X-Payment` header
     - skill executes, returns result
  3. KeeperHub workflow run shows up in the dashboard, settles the payment
  4. RoyaltyVault USDC balance → 95% reaches Researcher's iNFT owner
- [ ] Smoke-record this 90-second loop for Demo agent

### Day 5+
- [ ] Polish, edge case handling
- [ ] Help Demo with `examples/writer` polish
- [ ] **Finish FEEDBACK.md** — this is required for KeeperHub prize eligibility. Aim for 800+ words, specific bugs, specific feature requests.

## Tests

```
packages/keeperhub-execute/test/
  - compile.test.ts         # ExecutionIntent → workflow JSON snapshots
  - executor.test.ts        # mocked HTTP, polling logic, error paths

packages/x402-skill-market/test/
  - paywall.test.ts         # 402 response shape matches x402 spec
  - verify.test.ts          # valid + invalid receipts
  - settle.test.ts          # workflow trigger called with correct payload
```

Run: `bun test` in each package.

## FEEDBACK.md — required

Both KeeperHub and Uniswap require honest builder feedback. KeeperHub has a separate $500 bounty for the best feedback (up to 2 winners @ $250).

**You write the KeeperHub section.** Demo agent will write the Uniswap section if applicable.

Template:

```markdown
## KeeperHub builder feedback

### What worked
- ...

### Reproducible bugs
- ... (with steps to reproduce)

### UX / UI friction
- ...

### Documentation gaps
- ...

### Feature requests
- ...
```

Be specific and actionable. "Docs were confusing" doesn't qualify; "the `workflows.create` MCP tool's response shape isn't documented; I had to inspect responses to discover `id` is at top level not under `data`" does.

Aim for ≥ 800 words by the time you submit.

## Definition of done

- [ ] `KeeperHubExecutor` works for `contractCall`, `erc20Transfer`, `nativeTransfer`, basic `multistep`
- [ ] x402 paywall server returns spec-compliant 402 responses
- [ ] x402 receipt verification passes against our own facilitator (the first 0G x402 facilitator!)
- [ ] `clawforger.x402-settle` workflow template deployed; settlement happens automatically after a paid call
- [ ] End-to-end Writer-pays-Researcher demo runs in ≤ 90 seconds
- [ ] `FEEDBACK.md` ≥ 800 words, ≥ 5 specific items across the 4 categories
- [ ] Every onchain side effect from any package goes through KeeperHub (no `eth_sendTransaction` from anywhere except KeeperHub MCP)

## Coordination notes

- **You depend on Contracts (Day 1).** You can mock `RoyaltyVault.settle` until they ship; just be ready to swap in real addresses.
- **You depend on Core (Day 2).** You can mock `Memory`/`Inference` to test in isolation.
- **You're consumed by Core via the `onSkillPublish` hook (Day 3+).**
- **You're consumed by Demo (Day 4+).** They build `examples/writer` against your client.
- **Don't change the `Executor` interface.** Core owns it. If you need a new method, file in `BLOCKERS.md`.

## Anti-patterns (specific to your terminal)

- **Don't shortcut KeeperHub.** Tempting to call `eth_sendRawTransaction` for "just this one quick test" — never. Every onchain call goes through KeeperHub. This is the entire pitch.
- **Don't skip x402 facilitator verification.** Hardcoding "if X-Payment header exists, accept" is a security hole and a judging red flag.
- **Don't write your own x402 SDK.** Use Coinbase's. Note any pain in FEEDBACK.md (under "what wish existed beyond x402's own libs").
- **Don't bake retry logic in your code.** KeeperHub does it. You poll; KeeperHub retries. Document this clearly in package docs.
- **Don't forget to write FEEDBACK.md as you go.** Trying to remember 4 days of friction at midnight on Day 7 produces vague nonsense that loses you the bounty.

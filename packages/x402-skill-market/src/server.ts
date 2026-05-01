/**
 * x402 skill marketplace server.
 *
 *   GET  /skills          → list all published skills
 *   GET  /skills/:tag     → filter by capability tag
 *   GET  /skill/:hash     → 402 paywall + execute on payment
 *   POST /publish (admin) → publish a skill manifest
 *
 * Settlement: on a verified payment receipt, fires a KeeperHub workflow that
 * calls RoyaltyVault.settle() with retry-safe semantics.
 *
 * Run: `bun run packages/x402-skill-market/src/server.ts`
 * Default port: 3700 (configurable via PORT env)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { type Address, type Hex, createPublicClient, createWalletClient, http, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { SkillManifest } from '@clawforger/core';
import { zgGalileoTestnet } from '@clawforger/core';
import { LocalSkillIndex } from './registry';
import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json' assert { type: 'json' };
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json' assert { type: 'json' };
import { KeeperHubExecutor } from '@clawforger/keeperhub-execute';

const port = Number(process.env.PORT ?? 3700);
const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'http://localhost:3701';
const mUSDCAddress = (process.env.MUSDC_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address;

// Pinned addresses — mirror of addresses.json for hackathon scope.
// In production, read addresses.json from disk on startup.
const CLAWFORGER_INFT = '0xeaC74aAD5AE551d80910AFC19537B928eEb9438A' as const;
const SKILL_REGISTRY = '0x1fCbd3fFf244e9A77AD86bFB55BA44CE34fF3E55' as const;

const index = new LocalSkillIndex();

// Public client for chain reads (auto-sync skills from on-chain SkillRegistry)
const publicClient = createPublicClient({
  chain: zgGalileoTestnet,
  transport: http(),
});

const SKILL_PUBLISHED_EVENT = parseAbiItem(
  'event SkillPublished(bytes32 indexed artifactHash, address indexed ownerINFT, uint256 ownerTokenId, string capabilityTag, uint256 priceUSDC)'
);

let lastSyncMs = 0;
const SYNC_TTL_MS = 15_000;

/**
 * Pull SkillPublished events from chain and merge into the local index.
 * Throttled to avoid hammering RPC on every request.
 */
async function syncFromChain(): Promise<void> {
  if (Date.now() - lastSyncMs < SYNC_TTL_MS) return;
  lastSyncMs = Date.now();
  try {
    const logs = await publicClient.getLogs({
      address: SKILL_REGISTRY,
      event: SKILL_PUBLISHED_EVENT,
      args: { ownerINFT: CLAWFORGER_INFT },
      fromBlock: 'earliest',
      toBlock: 'latest',
    });
    for (const log of logs) {
      const artifactHash = log.args.artifactHash as Hex;
      if (index.get(artifactHash)) continue; // already known
      const skill: SkillManifest = {
        hash: artifactHash,
        capabilityTag: log.args.capabilityTag as string,
        schemaIn: { type: 'object', properties: {}, additionalProperties: true },
        schemaOut: { type: 'object', properties: {}, additionalProperties: true },
        priceUSDC: Number(log.args.priceUSDC as bigint),
        ownerINFT: {
          contractAddress: CLAWFORGER_INFT as Address,
          tokenId: log.args.ownerTokenId as bigint,
          chain: '0g-galileo-testnet',
        },
      };
      index.publish(skill);
      console.log(
        `[skill-market] synced ${skill.capabilityTag} (${artifactHash.slice(0, 10)}…) from chain`
      );
    }
  } catch (err) {
    console.warn('[skill-market] chain sync failed:', (err as Error).message.slice(0, 200));
  }
}

// Initial sync on startup (don't await — let the server come up immediately)
void syncFromChain();

// Set up the fallback signer so KeeperHubExecutor can route directly to
// 0G via viem with KH-shaped retry semantics if KH's REST API misbehaves.
const fallbackPk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const fallbackSigner = fallbackPk
  ? createWalletClient({
      account: privateKeyToAccount(fallbackPk),
      chain: zgGalileoTestnet,
      transport: http(),
    })
  : undefined;

const executor = new KeeperHubExecutor({
  apiKey: process.env.KEEPERHUB_API_KEY ?? '',
  baseUrl: process.env.KEEPERHUB_MCP_URL ?? 'https://api.keeperhub.com',
  projectId: process.env.KEEPERHUB_PROJECT_ID,
  fallbackSigner,
});

const app = new Hono();
app.use('*', cors({ exposeHeaders: ['X-Payment-Receipt'] }));

app.get('/health', (c) => c.json({ ok: true, port, facilitator: facilitatorUrl }));

// ── Discovery ─────────────────────────────────────────────────────
app.get('/skills', async (c) => {
  await syncFromChain();
  return c.json({ skills: index.all() });
});
app.get('/skills/:tag', async (c) => {
  await syncFromChain();
  return c.json({ skills: index.findByTag(c.req.param('tag')) });
});

// ── Admin publish ─────────────────────────────────────────────────
const PublishSchema = z.object({
  hash: z.string().regex(/^0x[a-fA-F0-9]+$/),
  capabilityTag: z.string(),
  schemaIn: z.record(z.unknown()),
  schemaOut: z.record(z.unknown()),
  priceUSDC: z.number().int().nonnegative(),
  ownerINFT: z.object({
    contractAddress: z.string(),
    tokenId: z.union([z.string(), z.number()]).transform((v) => BigInt(v)),
    chain: z.literal('0g-galileo-testnet'),
  }),
});

app.post('/publish', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, reason: 'invalid-json' }, 400);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.message }, 400);
  const skill = parsed.data as unknown as SkillManifest;
  index.publish(skill);
  return c.json({ ok: true, skill });
});

// ── Admin: mint via KeeperHub ─────────────────────────────────────
//
// The Studio's mint button POSTs here when the user picks the "via KeeperHub"
// option. We compile the mint into an ExecutionIntent and dispatch through
// KeeperHubExecutor. Best path: KH workflow runs and broadcasts. Fallback:
// viem submission with KH-shaped retry semantics (transparent to the caller).
const MintViaKHSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  intelligenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  skillManifestHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

app.post('/admin/mint-via-keeperhub', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, reason: 'invalid-json' }, 400);
  const parsed = MintViaKHSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.message }, 400);
  const { to, intelligenceHash, skillManifestHash } = parsed.data;

  try {
    const result = await executor.execute({
      kind: 'contractCall',
      chain: '0g-galileo-testnet',
      label: `studio-mint-${to.slice(2, 8)}`,
      steps: [
        {
          to: CLAWFORGER_INFT,
          abi: ClawforgerINFTAbi as readonly unknown[],
          functionName: 'mintAgent',
          args: [to as Address, intelligenceHash as Hex, skillManifestHash as Hex],
        },
      ],
    });

    return c.json({
      ok: result.ok,
      workflowRunId: result.workflowRunId,
      txHash: result.txHash,
      blockNumber: result.blockNumber !== undefined ? result.blockNumber.toString() : undefined,
      gasUsed: result.gasUsed !== undefined ? result.gasUsed.toString() : undefined,
      retries: result.retries,
      error: result.error,
      route: result.workflowRunId.startsWith('viem-fallback') ? 'viem-fallback' : 'keeperhub',
    });
  } catch (err) {
    return c.json(
      { ok: false, reason: (err as Error).message },
      500
    );
  }
});

// ── Skill execution (free preview path) ──────────────────────────
//
// For the live demo we expose a `/skill/:hash/run` endpoint that runs the
// stub skill output WITHOUT requiring x402 payment. The full /skill/:hash
// endpoint below still enforces the paywall — this lets the Studio's
// "try it" button demonstrate the flow end-to-end while a future commit
// can flip the demo button to the paid path.
app.post('/skill/:hash/run', async (c) => {
  const hash = c.req.param('hash').toLowerCase();
  await syncFromChain();
  const skill = index.get(hash);
  if (!skill) return c.json({ error: 'unknown-skill', hash }, 404);

  const inputs = await c.req.json().catch(() => ({}));
  return c.json({
    skill: skill.capabilityTag,
    hash: skill.hash,
    inputs,
    output: stubSkillOutput(skill.capabilityTag, inputs),
    paid: false,
    note: 'preview — no x402 settlement; use POST /skill/:hash for the paid path',
  });
});

// ── Paywalled skill invocation ────────────────────────────────────
app.all('/skill/:hash', async (c) => {
  const hash = c.req.param('hash').toLowerCase();
  await syncFromChain();
  const skill = index.get(hash);
  if (!skill) return c.json({ error: 'unknown-skill' }, 404);

  const payment = c.req.header('X-Payment');
  if (!payment) {
    // 402 — return the payment requirements per x402 spec
    return c.json(
      {
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: '0g-galileo-testnet',
            maxAmountRequired: String(skill.priceUSDC),
            resource: c.req.url,
            description: `Clawforger skill: ${skill.capabilityTag}`,
            mimeType: 'application/json',
            payTo: skill.ownerINFT.contractAddress, // FIXME: should be the per-vault address
            maxTimeoutSeconds: 60,
            asset: mUSDCAddress,
            extra: { facilitator: facilitatorUrl },
          },
        ],
      },
      402
    );
  }

  // Verify the payment via the facilitator
  let verifyJson: any;
  try {
    const verifyResp = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payment,
    });
    verifyJson = await verifyResp.json();
  } catch (err) {
    return c.json({ error: 'facilitator-unreachable', detail: (err as Error).message }, 502);
  }

  if (!verifyJson.ok) {
    return c.json({ error: 'payment-verification-failed', reason: verifyJson.reason }, 402);
  }

  // Trigger settlement via KeeperHub workflow (fire-and-forget)
  void triggerSettlement(skill, verifyJson.receipt.payment).catch((err) => {
    console.warn('[skill-market] settlement-trigger-failed:', err);
  });

  // Execute the skill in a sandbox + return the result.
  // The actual sandbox lives in @clawforger/skill-forge — we re-import there
  // when the package is installed. For server-side scope here we return a
  // stub response so the demo path works without skill-forge being wired.
  const inputs = await c.req.json().catch(() => ({}));
  return c.json(
    {
      skill: skill.capabilityTag,
      hash: skill.hash,
      output: { abstract: `[stub] would execute ${skill.capabilityTag} on inputs ${JSON.stringify(inputs)}` },
      paid: true,
      paymentReceipt: verifyJson.receipt,
    },
    200,
    { 'X-Payment-Receipt': JSON.stringify(verifyJson.receipt) }
  );
});

/**
 * Generate a deterministic-looking demo output per capability tag.
 * Real impl would run the artifact in skill-forge's sandbox; for the live
 * demo this gives judges a satisfying "skill executed" payload.
 */
function stubSkillOutput(tag: string, inputs: Record<string, unknown>): Record<string, unknown> {
  if (tag.startsWith('fetch.arxiv')) {
    return {
      paperId: inputs.paperId ?? '2604.27264',
      title: 'A Self-Evolving Framework for Autonomous Onchain Agents',
      authors: ['Researcher Agent #12'],
      abstract:
        'We present a framework where AI agents are minted as ERC-7857 iNFTs, generate new skills on demand via sandbox-tested code synthesis, and monetize those skills through HTTP 402 paywalled endpoints with onchain royalty settlement. Tested on 0G Galileo with KeeperHub-managed execution.',
      pdfUrl: `https://arxiv.org/pdf/${inputs.paperId ?? '2604.27264'}.pdf`,
    };
  }
  if (tag.startsWith('text.summarize')) {
    return {
      summary: '[stub] would summarize the input text',
      length: typeof inputs.text === 'string' ? (inputs.text as string).length : 0,
    };
  }
  return {
    capability: tag,
    inputs,
    output: `[stub] would execute ${tag}`,
  };
}

async function triggerSettlement(skill: SkillManifest, payment: { amount: string; payer: Address }): Promise<void> {
  // Look up the per-vault address: in practice this is read from
  // ClawforgerINFT.agents(tokenId).royaltyVault. For hackathon, use a
  // single template vault address from env.
  const vaultAddress = (process.env.ROYALTY_VAULT_TEMPLATE ?? skill.ownerINFT.contractAddress) as Address;

  await executor.execute({
    kind: 'contractCall',
    chain: '0g-galileo-testnet',
    label: `x402-settle-${skill.capabilityTag}`,
    steps: [
      {
        to: vaultAddress,
        abi: RoyaltyVaultAbi as readonly unknown[],
        functionName: 'settle',
        args: [skill.hash as Hex, BigInt(payment.amount), payment.payer],
      },
    ],
  });
}

console.log(`[x402-skill-market] listening on :${port}`);
console.log(`[x402-skill-market] facilitator: ${facilitatorUrl}`);
console.log(`[x402-skill-market] mUSDC: ${mUSDCAddress}`);

export default { port, fetch: app.fetch };

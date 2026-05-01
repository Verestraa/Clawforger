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
import type { Address, Hex } from 'viem';
import type { SkillManifest } from '@clawforger/core';
import { LocalSkillIndex } from './registry';
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json' assert { type: 'json' };
import { KeeperHubExecutor } from '@clawforger/keeperhub-execute';

const port = Number(process.env.PORT ?? 3700);
const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'http://localhost:3701';
const mUSDCAddress = (process.env.MUSDC_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address;

const index = new LocalSkillIndex();

const executor = new KeeperHubExecutor({
  apiKey: process.env.KEEPERHUB_API_KEY ?? '',
  baseUrl: process.env.KEEPERHUB_MCP_URL ?? 'https://api.keeperhub.com',
  projectId: process.env.KEEPERHUB_PROJECT_ID,
});

const app = new Hono();
app.use('*', cors({ exposeHeaders: ['X-Payment-Receipt'] }));

app.get('/health', (c) => c.json({ ok: true, port, facilitator: facilitatorUrl }));

// ── Discovery ─────────────────────────────────────────────────────
app.get('/skills', (c) => c.json({ skills: index.all() }));
app.get('/skills/:tag', (c) => c.json({ skills: index.findByTag(c.req.param('tag')) }));

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

// ── Paywalled skill invocation ────────────────────────────────────
app.all('/skill/:hash', async (c) => {
  const hash = c.req.param('hash').toLowerCase();
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

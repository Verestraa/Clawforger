/**
 * Standalone x402 facilitator server.
 *
 *   POST /verify  → { ok, receipt | reason }
 *   GET  /health  → { ok: true }
 *
 * Run: `bun run packages/x402-facilitator/src/server.ts`
 * Default port: 3701 (configurable via PORT env)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { type Address, type Hex, privateKeyToAccount } from 'viem/accounts';
import { verifyPayment } from './verify';

const port = Number(process.env.PORT ?? 3701);
const facilitatorPrivateKey = (process.env.X402_FACILITATOR_PRIVATE_KEY ?? '') as Hex;

if (!facilitatorPrivateKey) {
  console.error('Missing X402_FACILITATOR_PRIVATE_KEY in env');
  process.exit(1);
}

const account = privateKeyToAccount(facilitatorPrivateKey);
const facilitatorAddress = account.address as Address;

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) =>
  c.json({ ok: true, facilitator: facilitatorAddress, network: '0g-galileo-testnet' })
);

app.post('/verify', async (c) => {
  const payload = await c.req.json().catch(() => null);
  if (!payload) return c.json({ ok: false, reason: 'invalid-json' }, 400);
  const result = await verifyPayment(payload, {
    facilitatorPrivateKey,
    facilitatorAddress,
    rpcUrl: process.env.ZG_GALILEO_RPC,
  });
  return c.json(result, result.ok ? 200 : 400);
});

console.log(`[x402-facilitator] listening on :${port}`);
console.log(`[x402-facilitator] facilitator address: ${facilitatorAddress}`);

export default { port, fetch: app.fetch };

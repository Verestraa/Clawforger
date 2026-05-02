/**
 * Read-only probe of 0G Aristotle mainnet (chainId 16661).
 *
 *   bun run scripts/probe-mainnet.ts
 *
 * Reports:
 *   - Wallet native 0G balance on mainnet
 *   - Existing broker ledger (if any)
 *   - Service catalog (providers + models)
 *
 * Costs nothing. Does NOT call depositFund or transferFund.
 */

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const MAINNET_RPC = process.env.ZG_MAINNET_RPC ?? 'https://evmrpc.0g.ai';
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error('DEPLOYER_PRIVATE_KEY missing — set it in .env');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
const wallet = new ethers.Wallet(pk, provider);

console.log(`\n=== 0G Aristotle Mainnet Probe ===`);
console.log(`RPC:    ${MAINNET_RPC}`);
console.log(`Wallet: ${wallet.address}\n`);

// ── Native balance ──────────────────────────────────────────────
let nativeBalance = 0n;
try {
  nativeBalance = await provider.getBalance(wallet.address);
  console.log(`Native 0G balance:  ${ethers.formatEther(nativeBalance)} 0G`);
} catch (err) {
  console.error(`failed to read native balance: ${(err as Error).message}`);
}

// Bail early if obviously underfunded
if (nativeBalance < ethers.parseEther('0.5')) {
  console.error(`\n⚠ wallet under-funded (need 5+ 0G to comfortably run smoke test)`);
  console.error(`  expected: ≥3 0G ledger + ≥1 0G provider + buffer`);
  process.exit(2);
}

// ── Broker ledger (read-only) ───────────────────────────────────
let broker: any;
try {
  console.log(`\nconnecting broker...`);
  broker = await createZGComputeNetworkBroker(wallet);
  console.log(`broker connected.`);
} catch (err) {
  console.error(`broker connect failed: ${(err as Error).message}`);
  process.exit(3);
}

try {
  const ledger = await broker.ledger.getLedger();
  console.log(`\nbroker.ledger.getLedger():`);
  console.dir(ledger, { depth: 4 });
  const total = pickField(ledger, ['totalBalance', 'balance', 'amount']);
  const locked = pickField(ledger, ['locked', 'lockedBalance']);
  if (total !== undefined) {
    console.log(`  total deposited :  ${fmt(total)} 0G`);
    if (locked !== undefined) {
      console.log(`  locked          :  ${fmt(locked)} 0G`);
      console.log(`  available       :  ${fmt(total - locked)} 0G`);
    }
  }
} catch (err) {
  console.log(`\nno existing ledger on mainnet (expected for first run): ${(err as Error).message.slice(0, 100)}`);
}

// ── Service catalog ─────────────────────────────────────────────
console.log(`\ndiscovering services...`);
let services: any[] = [];
try {
  services = await broker.inference.listService();
} catch (err) {
  console.error(`listService failed: ${(err as Error).message}`);
  process.exit(4);
}
console.log(`found ${services.length} services:\n`);

for (let i = 0; i < services.length; i++) {
  const s = services[i];
  const info = derive(s);
  console.log(`  [${i}] model="${info.model}"`);
  console.log(`      provider=${info.providerAddress}`);
  console.log(`      endpoint=${info.endpoint}`);
  if (info.inputPrice !== undefined) {
    console.log(`      pricing  input=${info.inputPrice} output=${info.outputPrice} (neuron/token)`);
  }
  console.log(``);
}

// Hint at which one to default to. Order of preference:
//   1) deepseek-v3 (strong native tool-calling)
//   2) glm (announced live on mainnet)
//   3) gpt-oss-120b (OpenAI-trained tool format)
//   4) anything else
function score(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('deepseek') && m.includes('v3')) return 100;
  if (m.includes('deepseek')) return 90;
  if (m.includes('glm-5') || m.includes('glm5')) return 80;
  if (m.includes('glm')) return 70;
  if (m.includes('gpt-oss') || m.includes('oss-120')) return 60;
  if (m.includes('qwen3')) return 50;
  if (m.includes('qwen')) return 40;
  return 10;
}
const ranked = services
  .map((s, i) => ({ idx: i, info: derive(s), score: score(derive(s).model) }))
  .sort((a, b) => b.score - a.score);

if (ranked.length > 0 && ranked[0]) {
  const best = ranked[0];
  console.log(`recommended default model:  "${best.info.model}"`);
  console.log(`recommended modelHint:      "${pickHint(best.info.model)}"`);
  console.log(`provider:                   ${best.info.providerAddress}`);
}

console.log(`\n=== probe complete (no spend) ===\n`);

// ── helpers ─────────────────────────────────────────────────────

function pickHint(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('glm')) return 'glm';
  if (m.includes('gpt-oss')) return 'gpt-oss';
  if (m.includes('qwen')) return 'qwen';
  return model.split(/[-/\s]/)[0] ?? model;
}

function derive(s: any): {
  providerAddress: string;
  model: string;
  endpoint: string;
  inputPrice?: string;
  outputPrice?: string;
} {
  const named = {
    providerAddress: s.providerAddress ?? s.provider ?? s.address ?? '',
    model: s.model ?? s.modelName ?? s.name ?? '',
    endpoint: s.endpoint ?? s.url ?? s.serviceUrl ?? '',
  };
  let providerAddress = named.providerAddress;
  let endpoint = named.endpoint;
  let model = named.model;
  const seen: string[] = [];
  for (const v of Object.values(s)) {
    if (typeof v === 'string') {
      if (!providerAddress && /^0x[0-9a-fA-F]{40}$/.test(v)) providerAddress = v;
      else if (!endpoint && /^https?:\/\//.test(v)) endpoint = v;
      else seen.push(v);
    }
  }
  if (!model) {
    for (const v of seen) {
      if (v && v.length < 100 && !v.startsWith('0x')) {
        model = v;
        break;
      }
    }
  }
  // Pricing fields if present
  const inputPrice =
    s.inputPrice !== undefined ? String(s.inputPrice) : undefined;
  const outputPrice =
    s.outputPrice !== undefined ? String(s.outputPrice) : undefined;
  return { providerAddress, model, endpoint, inputPrice, outputPrice };
}

function pickField(obj: unknown, keys: string[]): bigint | undefined {
  if (obj == null) return undefined;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      if (typeof v === 'bigint' && v > 100n) return v;
    }
  }
  return undefined;
}

function fmt(neuron: bigint): string {
  return ethers.formatEther(neuron);
}

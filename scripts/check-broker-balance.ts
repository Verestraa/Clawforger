/**
 * Read-only: how much 0G is left in the 0G Compute broker ledger
 * for DEPLOYER_PRIVATE_KEY's wallet, and what's been spent so far.
 *
 *   bun run scripts/check-broker-balance.ts
 */

import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { ethers } from 'ethers';

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY missing');

const rpcUrl = process.env.ZG_GALILEO_RPC ?? 'https://evmrpc-testnet.0g.ai';
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(pk, provider);

console.log(`wallet: ${wallet.address}`);
const broker = await createZGComputeNetworkBroker(wallet);

const ledger = await broker.ledger.getLedger();
console.log('\nbroker.ledger.getLedger() →');
console.dir(ledger, { depth: 4 });

// The ledger struct is { user, totalBalance, locked, ... } in OG's neuron units.
// Try a few common shapes for hackathon-grade resilience.
const total = pickField(ledger, ['totalBalance', 'balance', 'amount']);
const locked = pickField(ledger, ['locked', 'lockedBalance']);
if (total !== undefined) {
  console.log(`\n  total deposited :  ${fmt(total)} 0G`);
  if (locked !== undefined) {
    console.log(`  locked (in-flight):  ${fmt(locked)} 0G`);
    console.log(`  available        :  ${fmt(total - locked)} 0G`);
  }
}

function pickField(obj: unknown, keys: string[]): bigint | undefined {
  if (obj == null) return undefined;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  }
  // Try positional access for ethers Result tuples
  if (Array.isArray(obj)) {
    for (const v of obj) {
      if (typeof v === 'bigint' && v > 100n) return v;
    }
  }
  return undefined;
}

function fmt(neuron: bigint): string {
  // 0G uses 18 decimals like ETH
  return ethers.formatEther(neuron);
}

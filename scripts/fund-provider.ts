/**
 * Resume mainnet smoke test from step 4 (provider sub-account funding).
 * Ledger already created in previous run (3 0G).
 */

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC = process.env.ZG_MAINNET_RPC ?? 'https://evmrpc.0g.ai';
const pk = process.env.DEPLOYER_PRIVATE_KEY!;
const PROVIDER = '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0'; // DeepSeek v3

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(pk, provider);
console.log(`wallet: ${wallet.address}`);

const broker = await createZGComputeNetworkBroker(wallet);
console.log('broker connected.\n');

console.log('current ledger:');
console.dir(await broker.ledger.getLedger(), { depth: 2 });

// Try several arg shapes — the SDK has been known to be picky about BigInt vs number
const attempts: Array<{ desc: string; args: any[] }> = [
  { desc: 'BigInt(1) — whole 0G as BigInt', args: [PROVIDER, 'inference', 1n] },
  {
    desc: 'BigInt(1e18) — neuron units as BigInt',
    args: [PROVIDER, 'inference', BigInt(10) ** BigInt(18)],
  },
  { desc: 'string "1"', args: [PROVIDER, 'inference', '1'] },
];

let succeeded = false;
for (const a of attempts) {
  console.log(`\nattempting transferFund: ${a.desc}`);
  try {
    await broker.ledger.transferFund(...a.args);
    console.log(`  ✓ success`);
    succeeded = true;
    break;
  } catch (err) {
    console.log(`  ✗ failed: ${(err as Error).message.slice(0, 200)}`);
  }
}

if (!succeeded) {
  console.error('\nall transferFund variants failed.');
  process.exit(1);
}

console.log('\nfinal ledger:');
console.dir(await broker.ledger.getLedger(), { depth: 2 });

console.log('\nacknowledgeProviderSigner...');
try {
  await broker.inference.acknowledgeProviderSigner(PROVIDER);
  console.log('  ✓ acknowledged');
} catch (err) {
  const m = (err as Error).message;
  if (m.includes('already')) console.log(`  already acknowledged`);
  else console.warn(`  warning: ${m.slice(0, 200)}`);
}

console.log('\ndone — ready for chat call.');

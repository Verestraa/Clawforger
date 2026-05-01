/**
 * examples/researcher — the canonical Clawforger demo agent.
 *
 * What this script does:
 *   1. Loads addresses.json from the repo root
 *   2. Creates a wallet client from DEPLOYER_PRIVATE_KEY
 *   3. Mints a Researcher iNFT (or loads RESEARCHER_TOKEN_ID if set)
 *   4. Wires the agent: ZGMemory + MockInference + KeeperHubExecutor
 *   5. Gives it a task it cannot solve
 *   6. Triggers skill-forge to evolve a fetch.arxiv skill
 *   7. Logs the new skill manifest hash and iNFT metadata-update tx
 *
 * Run:
 *   bun run examples/researcher/src/index.ts
 *
 * Pre-reqs (see WAKEUP.md):
 *   - Contracts deployed → addresses.json populated
 *   - DEPLOYER_PRIVATE_KEY funded with 0G + mUSDC
 */

import { readFile } from 'node:fs/promises';
import { Agent, MockInference } from '@clawforger/core';
import type { Task } from '@clawforger/core';
import { mintAgent } from '@clawforger/inft-identity';
import { KeeperHubExecutor } from '@clawforger/keeperhub-execute';
import {
  InMemoryZGStorage,
  ZGMemory,
  deriveKeyFromSignature,
} from '@clawforger/memory-0g';
import { evolve } from '@clawforger/skill-forge';
import { type Address, type Hex, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { zgGalileoTestnet } from '@clawforger/core';

import { RESEARCHER_PERSONALITY } from './personality';

const ADDRESSES_PATH = new URL('../../../addresses.json', import.meta.url);

async function main() {
  // ── 1. Load addresses ───────────────────────────────────────────
  let addresses: any;
  try {
    addresses = JSON.parse(await readFile(ADDRESSES_PATH, 'utf8'));
  } catch (err) {
    console.error('Could not load addresses.json — run the deploy script first');
    console.error('  bun run contracts:deploy');
    process.exit(1);
  }
  const chainAddrs = addresses.chains['0g-galileo-testnet'];
  if (!chainAddrs?.ClawforgerINFT) {
    console.error('addresses.json missing ClawforgerINFT — redeploy');
    process.exit(1);
  }
  const inftAddress = chainAddrs.ClawforgerINFT as Address;

  // ── 2. Wallet ────────────────────────────────────────────────────
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) {
    console.error('Missing DEPLOYER_PRIVATE_KEY in env');
    process.exit(1);
  }
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: zgGalileoTestnet, transport: http() });

  console.log(`[researcher] using wallet ${account.address}`);

  // ── 3. Encryption key (derive from a fixed signature) ────────────
  // For the example, we use the private key itself as the IKM. In production
  // the wallet signs the keyDerivationChallenge() and that signature is the IKM.
  const encryptionKey = await deriveKeyFromSignature(pk);
  const storage = new InMemoryZGStorage();
  // ↑ Replace with RealZGStorageClient once @0gfoundation/0g-ts-sdk is wired.

  // ── 4. Mint or load iNFT ────────────────────────────────────────
  let tokenId: bigint;
  if (process.env.RESEARCHER_TOKEN_ID) {
    tokenId = BigInt(process.env.RESEARCHER_TOKEN_ID);
    console.log(`[researcher] loading existing iNFT #${tokenId}`);
  } else {
    console.log('[researcher] minting fresh iNFT...');
    const minted = await mintAgent({
      inftAddress,
      to: account.address,
      systemPrompt: RESEARCHER_PERSONALITY,
      signer: wallet,
      storage,
      encryptionKey,
      chain: '0g-galileo-testnet',
    });
    tokenId = minted.tokenId;
    console.log(`[researcher] minted iNFT #${tokenId} (tx ${minted.txHash})`);
  }

  // ── 5. Construct the agent ──────────────────────────────────────
  const inft = { contractAddress: inftAddress, tokenId, chain: '0g-galileo-testnet' as const };
  const memory = new ZGMemory({ storage, encryptionKey, namespace: `agents/${tokenId}` });
  const inference = new MockInference();
  const executor = new KeeperHubExecutor({
    apiKey: process.env.KEEPERHUB_API_KEY ?? '',
    baseUrl: process.env.KEEPERHUB_MCP_URL ?? 'https://api.keeperhub.com',
    fallbackSigner: wallet,
  });

  const agent = new Agent(inft, memory, inference, executor);

  // ── 6. Task it cannot solve ─────────────────────────────────────
  const task: Task = {
    id: 'task-1-arxiv',
    description: 'Summarize arxiv paper 2604.27264',
    inputs: { paperId: '2604.27264' },
    successCriteria: { kind: 'stringContains', s: 'abstract' },
  };

  console.log(`[researcher] running task: ${task.description}`);
  const initial = await agent.run(task);
  console.log(`[researcher] initial run ok=${initial.ok}`);

  if (!initial.ok) {
    console.log('[researcher] no matching skill — evolving...');
    const evolved = await evolve({
      agent,
      task,
      signer: wallet,
      storage,
      encryptionKey,
      onAttempt: (n, _code, result) => {
        console.log(`  attempt ${n}: passed=${result.passed} reason=${result.reason ?? '—'}`);
      },
    });

    if (evolved.ok && evolved.skill) {
      console.log('[researcher] ✓ evolved new skill:');
      console.log(`    tag:   ${evolved.skill.capabilityTag}`);
      console.log(`    hash:  ${evolved.skill.hash}`);
      console.log(`    price: ${evolved.skill.priceUSDC} mUSDC base units`);
    } else {
      console.error(`[researcher] ✗ evolution failed: ${evolved.reason}`);
      process.exit(1);
    }
  }

  console.log('[researcher] done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

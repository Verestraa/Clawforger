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
import { Agent, ZGComputeInference, MockInference } from '@clawforger/core';
import type { Task } from '@clawforger/core';
import { mintAgent } from '@clawforger/inft-identity';
import { KeeperHubExecutor } from '@clawforger/keeperhub-execute';
import {
  FileBackedZGStorage,
  ZGMemory,
  deriveKeyFromSignature,
} from '@clawforger/memory-0g';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { evolve } from '@clawforger/skill-forge';
import { type Address, type Hex, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { zgGalileoTestnet } from '@clawforger/core';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json' assert { type: 'json' };

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
  const skillRegistryAddress = chainAddrs.SkillRegistry as Address;

  // ── 2. Wallet ────────────────────────────────────────────────────
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) {
    console.error('Missing DEPLOYER_PRIVATE_KEY in env');
    process.exit(1);
  }
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: zgGalileoTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: zgGalileoTestnet, transport: http() });

  console.log(`[researcher] using wallet ${account.address}`);

  // ── 3. Encryption key (derive from a fixed signature) ────────────
  // For the example, we use the private key itself as the IKM. In production
  // the wallet signs the keyDerivationChallenge() and that signature is the IKM.
  const encryptionKey = await deriveKeyFromSignature(pk);
  // Share the same on-disk store the marketplace server uses so memory log
  // entries (skill publishes, evolutions, mint events) appear in the studio's
  // /agents/<id> "memory log" tab. Both processes derive identical keys from
  // the same DEPLOYER_PRIVATE_KEY, so the namespace + decryption line up.
  const memoryFile =
    process.env.MEMORY_FILE ??
    resolve(fileURLToPath(new URL('../../../data/agent-memory.json', import.meta.url)));
  const storage = new FileBackedZGStorage(memoryFile);
  console.log(`[researcher] memory store: ${memoryFile}`);
  // ↑ Replace with RealZGStorageClient once @0gfoundation/0g-ts-sdk is wired.

  // ── 4. Mint or load iNFT ────────────────────────────────────────
  let tokenId: bigint;
  let mintTxHash: string | undefined;
  let freshMint = false;
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
    mintTxHash = minted.txHash;
    freshMint = true;
    console.log(`[researcher] minted iNFT #${tokenId} (tx ${minted.txHash})`);
  }

  // ── 5. Construct the agent ──────────────────────────────────────
  const inft = { contractAddress: inftAddress, tokenId, chain: '0g-galileo-testnet' as const };
  const memory = new ZGMemory({ storage, encryptionKey, namespace: `agents/${tokenId}` });

  // Append the mint event to the agent's memory log so the studio's
  // memory-log tab shows the genesis entry.
  if (freshMint) {
    await memory.logAppend({
      kind: 'agent.minted',
      data: {
        tokenId: String(tokenId),
        owner: account.address,
        intelligenceHashSource: 'researcher-personality',
        mintTxHash,
        chain: '0g-galileo-testnet',
        summary: `Agent #${tokenId} minted to ${account.address.slice(0, 8)}…`,
      },
      ts: Date.now(),
    });
  }

  // Real TEE-verified inference via 0G Compute Network. Falls back to
  // MockInference if the broker is unreachable or no providers are
  // available — keeps the demo runnable on a fresh laptop.
  const inference = new ZGComputeInference({
    privateKey: pk,
    rpcUrl: process.env.ZG_GALILEO_RPC,
    modelHint: process.env.ZG_COMPUTE_MODEL ?? 'qwen',
    fallbackToMock: true,
    debug: true,
  });

  const executor = new KeeperHubExecutor({
    apiKey: process.env.KEEPERHUB_API_KEY ?? '',
    baseUrl: process.env.KEEPERHUB_MCP_URL ?? 'https://app.keeperhub.com/mcp',
    fallbackSigner: wallet,
  });

  // Hook: when skill-forge succeeds, register the new skill on-chain via
  // SkillRegistry.publishSkill so the studio's marketplace can discover it.
  // This is what closes the loop between the off-chain self-evolution and
  // the on-chain economy that the demo video pitches.
  const onSkillPublish = async (skill: { hash: Hex; capabilityTag: string; priceUSDC: number }) => {
    console.log(`[researcher] publishing skill ${skill.capabilityTag} on-chain...`);
    let txHash: string | undefined;
    let alreadyOnChain = false;
    let publishErr: string | undefined;
    try {
      const { request } = await publicClient.simulateContract({
        address: skillRegistryAddress,
        abi: SkillRegistryAbi as readonly unknown[],
        functionName: 'publishSkill',
        args: [skill.hash, tokenId, skill.capabilityTag, BigInt(skill.priceUSDC)],
        account,
      });
      txHash = await wallet.writeContract(request);
      console.log(`[researcher] ✓ skill registered (tx ${txHash})`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('AlreadyPublished')) {
        alreadyOnChain = true;
        console.log(`[researcher] skill already on-chain — skipping`);
      } else {
        publishErr = msg.slice(0, 200);
        console.warn(`[researcher] skill publish failed:`, publishErr);
      }
    }
    // Append to the agent's encrypted log either way — successful publish,
    // already-on-chain (idempotent re-run), or failure (debugging trail).
    await memory.logAppend({
      kind: 'skill.published',
      data: {
        capabilityTag: skill.capabilityTag,
        artifactHash: skill.hash,
        priceUSDC: skill.priceUSDC,
        priceMUSDC: skill.priceUSDC / 1_000_000,
        txHash,
        alreadyOnChain,
        error: publishErr,
        summary: publishErr
          ? `skill ${skill.capabilityTag} publish failed: ${publishErr}`
          : alreadyOnChain
            ? `skill ${skill.capabilityTag} already on-chain (idempotent)`
            : `skill ${skill.capabilityTag} published @ ${(skill.priceUSDC / 1_000_000).toFixed(4)} mUSDC`,
      },
      ts: Date.now(),
    });
  };

  const agent = new Agent(inft, memory, inference, executor, [], { onSkillPublish });

  // ── 6. Task it cannot solve ─────────────────────────────────────
  // Tight success criterion — requires JSON output with both fields.
  // The MockInference default text response can't satisfy this; only an
  // evolved skill that returns structured JSON will pass. This forces
  // the self-evolution path to fire end-to-end.
  const task: Task = {
    id: 'task-1-arxiv',
    description: 'Summarize arxiv paper 2604.27264',
    inputs: { paperId: '2604.27264' },
    successCriteria: {
      kind: 'jsonSchemaMatch',
      schema: {
        type: 'object',
        properties: { abstract: { type: 'string' } },
        required: ['abstract'],
      },
    },
  };

  console.log(`[researcher] running task: ${task.description}`);
  const initial = await agent.run(task);
  console.log(`[researcher] initial run ok=${initial.ok}`);

  if (!initial.ok) {
    console.log('[researcher] no matching skill — evolving...');
    let attempts = 0;
    const evolved = await evolve({
      agent,
      task,
      signer: wallet,
      storage,
      encryptionKey,
      onAttempt: (n, _code, result) => {
        attempts = n;
        console.log(`  attempt ${n}: passed=${result.passed} reason=${result.reason ?? '—'}`);
        // Log per-attempt for the timeline — gives judges visibility into
        // the sandbox-test loop without dumping the LLM source.
        memory
          .logAppend({
            kind: 'evolve.attempt',
            data: {
              taskId: task.id,
              attempt: n,
              passed: result.passed,
              reason: result.reason,
              durationMs: result.durationMs,
              summary: `attempt ${n}: ${result.passed ? '✓ passed' : `✗ ${result.reason ?? 'failed'}`}`,
            },
            ts: Date.now(),
          })
          .catch(() => {
            /* memory append best-effort */
          });
      },
    });

    if (evolved.ok && evolved.skill) {
      console.log('[researcher] ✓ evolved new skill:');
      console.log(`    tag:   ${evolved.skill.capabilityTag}`);
      console.log(`    hash:  ${evolved.skill.hash}`);
      console.log(`    price: ${evolved.skill.priceUSDC} mUSDC base units`);
      await memory.logAppend({
        kind: 'evolve.success',
        data: {
          taskId: task.id,
          taskDescription: task.description,
          attempts,
          skill: {
            capabilityTag: evolved.skill.capabilityTag,
            artifactHash: evolved.skill.hash,
            priceUSDC: evolved.skill.priceUSDC,
          },
          summary: `evolved new skill ${evolved.skill.capabilityTag} after ${attempts} attempt${attempts === 1 ? '' : 's'}`,
        },
        ts: Date.now(),
      });
    } else {
      console.error(`[researcher] ✗ evolution failed: ${evolved.reason}`);
      await memory.logAppend({
        kind: 'evolve.failure',
        data: {
          taskId: task.id,
          taskDescription: task.description,
          attempts,
          reason: evolved.reason,
          summary: `evolution failed for ${task.id}: ${evolved.reason}`,
        },
        ts: Date.now(),
      });
      process.exit(1);
    }
  }

  console.log('[researcher] done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

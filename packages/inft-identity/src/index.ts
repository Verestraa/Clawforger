/**
 * Clawforger iNFT identity SDK.
 *
 * Wraps the ClawforgerINFT contract for browser + Node consumers. All onchain
 * writes funnel through here so the framework can swap the executor (KeeperHub
 * vs direct viem) at one point.
 */

import type {
  AgentData,
  INFTRef,
  SkillManifest,
  ZGChain,
} from '@clawforger/core';
import { getChain } from '@clawforger/core';
import {
  encrypt,
  contentHash,
  type ZGStorageClient,
} from '@clawforger/memory-0g';
import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  bytesToHex,
  createPublicClient,
  decodeEventLog,
  http,
} from 'viem';
import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json' assert { type: 'json' };

// ──────────────────────────────────────────────────────────────────
// Mint
// ──────────────────────────────────────────────────────────────────

export interface MintAgentOpts {
  inftAddress: Address;
  to: Address;
  systemPrompt: string;
  initialSkills?: SkillManifest[];
  signer: WalletClient;
  publicClient?: PublicClient;
  storage: ZGStorageClient;
  encryptionKey: CryptoKey;
  chain: ZGChain;
}

export interface MintAgentResult {
  tokenId: bigint;
  intelligenceHash: Hex;
  skillManifestHash: Hex;
  txHash: Hex;
}

/**
 * Encrypts the agent's "intelligence" payload, uploads it to 0G Storage,
 * then mints the iNFT. The encrypted blob lives at intelligenceHash.
 */
export async function mintAgent(opts: MintAgentOpts): Promise<MintAgentResult> {
  // 1. Encrypt + upload the intelligence blob
  const intelligenceBlob = await encrypt(opts.encryptionKey, {
    systemPrompt: opts.systemPrompt,
    initialSkills: opts.initialSkills ?? [],
    createdAt: Math.floor(Date.now() / 1000),
  });
  const intelligenceHash = await opts.storage.uploadBlob(intelligenceBlob);

  // 2. Encrypt + upload the skill manifest blob
  const skillManifestBlob = await encrypt(opts.encryptionKey, opts.initialSkills ?? []);
  const skillManifestHash = await opts.storage.uploadBlob(skillManifestBlob);

  // 3. Send the mint tx
  const chain = getChain(opts.chain);
  const publicClient =
    opts.publicClient ??
    createPublicClient({ chain, transport: http() });

  const account = opts.signer.account;
  if (!account) throw new Error('signer-needs-account');

  const { request } = await publicClient.simulateContract({
    address: opts.inftAddress,
    abi: ClawforgerINFTAbi as readonly unknown[],
    functionName: 'mintAgent',
    args: [opts.to, intelligenceHash, skillManifestHash],
    account,
  });

  const txHash = await opts.signer.writeContract(request);
  // 0G's public RPC intermittently lags receipt indexing — use our own
  // tolerant poller instead of viem's waitForTransactionReceipt.
  const receipt = await waitForReceiptResilient(publicClient, txHash);

  // 4. Extract tokenId from the AgentMinted event
  const tokenId = extractTokenIdFromReceipt(receipt);

  return { tokenId, intelligenceHash, skillManifestHash, txHash };
}

/**
 * Custom receipt poller. Retries getTransactionReceipt every 3s for up to 3 min,
 * swallowing TransactionReceiptNotFoundError. Survives transient RPC outages.
 */
async function waitForReceiptResilient(
  client: PublicClient,
  hash: Hex,
  maxWaitMs = 180_000
): Promise<{ logs: readonly { topics: readonly Hex[]; data: Hex }[] }> {
  const start = Date.now();
  // Initial delay so the tx has a moment to propagate
  await new Promise((r) => setTimeout(r, 2_000));

  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await client.getTransactionReceipt({ hash });
      // viem returns null/undefined or throws if not found, depending on transport
      if (r) return r as any;
    } catch {
      /* not found yet — keep polling */
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`receipt-not-found-after-${maxWaitMs}ms: ${hash}`);
}

function extractTokenIdFromReceipt(receipt: {
  logs: readonly { topics: readonly Hex[]; data: Hex }[];
}): bigint {
  // Decode each log against the iNFT ABI and pick AgentMinted.
  // (Don't use topics[1] heuristic — Transfer(from, to, tokenId) emits first
  //  and has from=0x0 in topics[1], producing a bogus tokenId of 0n.)
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ClawforgerINFTAbi as readonly unknown[],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === 'AgentMinted') {
        return (decoded.args as { tokenId: bigint }).tokenId;
      }
    } catch {
      // Not a log decodable by this ABI — skip
    }
  }
  throw new Error('AgentMinted-event-not-found-in-receipt');
}

// ──────────────────────────────────────────────────────────────────
// Read AgentData
// ──────────────────────────────────────────────────────────────────

export async function readAgentData(
  inft: INFTRef,
  publicClient: PublicClient
): Promise<AgentData> {
  const result = await publicClient.readContract({
    address: inft.contractAddress,
    abi: ClawforgerINFTAbi as readonly unknown[],
    functionName: 'agents',
    args: [inft.tokenId],
  });

  // Solidity `agents(tokenId)` returns the AgentData struct as a tuple
  const [intelligenceHash, skillManifestHash, memoryRootHash, royaltyVault, evolvedAt] =
    result as [Hex, Hex, Hex, Address, bigint];

  return {
    intelligenceHash,
    skillManifestHash,
    memoryRootHash,
    royaltyVault,
    evolvedAt: Number(evolvedAt),
  };
}

// ──────────────────────────────────────────────────────────────────
// Evolve
// ──────────────────────────────────────────────────────────────────

export interface EvolveAgentOpts {
  inft: INFTRef;
  newSkillManifest: SkillManifest[];
  newMemoryRoot: Hex;
  signer: WalletClient;
  publicClient?: PublicClient;
  storage: ZGStorageClient;
  encryptionKey: CryptoKey;
}

export interface EvolveAgentResult {
  txHash: Hex;
  newSkillManifestHash: Hex;
}

export async function evolveAgent(opts: EvolveAgentOpts): Promise<EvolveAgentResult> {
  // 1. Encrypt + upload the new skill manifest
  const blob = await encrypt(opts.encryptionKey, opts.newSkillManifest);
  const newSkillManifestHash = await opts.storage.uploadBlob(blob);

  // 2. Send the evolve tx
  const chain = getChain(opts.inft.chain);
  const publicClient =
    opts.publicClient ?? createPublicClient({ chain, transport: http() });

  const account = opts.signer.account;
  if (!account) throw new Error('signer-needs-account');

  const { request } = await publicClient.simulateContract({
    address: opts.inft.contractAddress,
    abi: ClawforgerINFTAbi as readonly unknown[],
    functionName: 'evolveAgent',
    args: [opts.inft.tokenId, newSkillManifestHash, opts.newMemoryRoot],
    account,
  });

  const txHash = await opts.signer.writeContract(request);
  // Best-effort receipt wait — non-blocking on failure for evolveAgent
  // since callers don't need event data from the receipt here.
  try {
    await waitForReceiptResilient(publicClient, txHash, 60_000);
  } catch (err) {
    console.warn('[inft-identity] evolveAgent receipt wait timed out, returning anyway:', (err as Error).message);
  }

  return { txHash, newSkillManifestHash };
}

// ──────────────────────────────────────────────────────────────────
// Secure transfer (re-encryption)
// ──────────────────────────────────────────────────────────────────

export interface TransferWithReencryptionOpts {
  inft: INFTRef;
  to: Address;
  /**
   * The intelligence payload re-encrypted under the recipient's pubkey.
   * In the ERC-7857 secure-transfer flow this is computed off-chain
   * (typically in a TEE or via threshold proxy re-encryption) before
   * the transfer tx is sent.
   */
  newIntelligenceBlob: Uint8Array;
  signer: WalletClient;
  publicClient?: PublicClient;
  storage: ZGStorageClient;
}

export interface TransferResult {
  txHash: Hex;
  newIntelligenceHash: Hex;
}

export async function transferWithReencryption(
  opts: TransferWithReencryptionOpts
): Promise<TransferResult> {
  // 1. Upload the recipient-encrypted blob
  const newIntelligenceHash = await opts.storage.uploadBlob(opts.newIntelligenceBlob);

  // 2. Send the on-chain tx
  const chain = getChain(opts.inft.chain);
  const publicClient =
    opts.publicClient ?? createPublicClient({ chain, transport: http() });

  const account = opts.signer.account;
  if (!account) throw new Error('signer-needs-account');

  const { request } = await publicClient.simulateContract({
    address: opts.inft.contractAddress,
    abi: ClawforgerINFTAbi as readonly unknown[],
    functionName: 'transferWithReencryption',
    args: [opts.inft.tokenId, opts.to, newIntelligenceHash],
    account,
  });
  const txHash = await opts.signer.writeContract(request);
  try {
    await waitForReceiptResilient(publicClient, txHash, 60_000);
  } catch (err) {
    console.warn('[inft-identity] transfer receipt wait timed out, returning anyway:', (err as Error).message);
  }

  return { txHash, newIntelligenceHash };
}

// re-export for convenience
export { contentHash };
export { bytesToHex };

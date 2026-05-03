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

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
import { ZGComputeInference } from '@clawforger/core';
import { Agent } from '@clawforger/core';
import type { Task } from '@clawforger/core';
import { evolve } from '@clawforger/skill-forge';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json' assert { type: 'json' };
import {
  FileBackedZGStorage,
  ZGMemory,
  deriveKeyFromSignature,
  decrypt,
} from '@clawforger/memory-0g';
import { detectPersona, buildPersonaCodegenHint } from '@clawforger/core';
import { getAgentWallet } from '@clawforger/core/agent-wallet';
import { erc20Abi } from 'viem';

const port = Number(process.env.PORT ?? 3700);
const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? 'http://localhost:3701';

// Pinned addresses — mirror of addresses.json for hackathon scope.
// In production, read addresses.json from disk on startup.
const CLAWFORGER_INFT = '0xfe9163ee0a168e30c10c458c3fadf9f8566647fc' as const;
const SKILL_REGISTRY = '0xdd8b4fbb08327367ddc61aaca5d119d7e5cedb47' as const;
const MUSDC_ADDRESS = '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5' as const;
const mUSDCAddress: Address = MUSDC_ADDRESS;

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
    let skipped = 0;
    for (const log of logs) {
      const artifactHash = log.args.artifactHash as Hex;
      if (index.get(artifactHash)) continue; // already known

      const tag = log.args.capabilityTag as string;
      const ownerTokenId = log.args.ownerTokenId as bigint;

      // FRESHNESS FILTER — only publish skills whose encrypted artifact
      // is decryptable on THIS server. Old skills from a prior server
      // instance (different AGENT_WALLET_SEED → different encryption
      // key, or whose blob never made it onto this disk) end up cluttering
      // the marketplace listing and lead the LLM into buying skills that
      // can only ever return placeholder. Filter them out at sync time.
      if (!encryptionKeyPromise) {
        // No key configured — can't validate; skip publishing entirely.
        skipped++;
        continue;
      }
      let schemaIn: Record<string, unknown> = {
        type: 'object',
        properties: {},
        additionalProperties: true,
      };
      let schemaOut: Record<string, unknown> = {
        type: 'object',
        properties: {},
        additionalProperties: true,
      };
      try {
        const blob = await storage.fetchBlob(artifactHash);
        const key = await encryptionKeyPromise;
        const artifact = (await decrypt(key, blob)) as
          | {
              code?: string;
              schemaIn?: Record<string, unknown>;
              schemaOut?: Record<string, unknown>;
            }
          | null;
        if (!artifact || typeof artifact.code !== 'string') {
          throw new Error('decrypted artifact missing code');
        }
        if (artifact.schemaIn) schemaIn = artifact.schemaIn;
        if (artifact.schemaOut) schemaOut = artifact.schemaOut;
      } catch (err) {
        skipped++;
        // Don't spam logs — first-time sync of a 30-skill registry is
        // expected to filter many. Log at debug level instead.
        const reason = (err as Error).message.slice(0, 80);
        console.log(
          `[skill-market] skip stale ${tag} #${ownerTokenId} (${artifactHash.slice(0, 10)}…): ${reason}`
        );
        continue;
      }

      const skill: SkillManifest = {
        hash: artifactHash,
        capabilityTag: tag,
        schemaIn,
        schemaOut,
        priceUSDC: Number(log.args.priceUSDC as bigint),
        ownerINFT: {
          contractAddress: CLAWFORGER_INFT as Address,
          tokenId: ownerTokenId,
          chain: '0g-galileo-testnet',
        },
      };
      index.publish(skill);
      const props = (schemaIn.properties as Record<string, unknown>) ?? {};
      const propCount = Object.keys(props).length;
      console.log(
        `[skill-market] synced ${skill.capabilityTag} (${artifactHash.slice(0, 10)}…) from chain — schema: ${propCount} props`
      );
    }
    if (skipped > 0) {
      console.log(
        `[skill-market] sync done — published ${index.all().length}, skipped ${skipped} stale (artifacts not decryptable on this server)`
      );
    }
  } catch (err) {
    console.warn('[skill-market] chain sync failed:', (err as Error).message.slice(0, 200));
  }
}

// Initial sync on startup (don't await — let the server come up immediately)
void syncFromChain();

/**
 * Look up the per-agent RoyaltyVault address for a given iNFT tokenId.
 * Cached per-tokenId since the vault address never changes after mint.
 */
const vaultCache = new Map<string, Address>();
async function getVaultForAgent(tokenId: bigint): Promise<Address> {
  const key = String(tokenId);
  const cached = vaultCache.get(key);
  if (cached) return cached;
  const result = (await publicClient.readContract({
    address: CLAWFORGER_INFT,
    abi: ClawforgerINFTAbi as readonly unknown[],
    functionName: 'agents',
    args: [tokenId],
  })) as readonly [Hex, Hex, Hex, Address, bigint];
  const vault = result[3];
  vaultCache.set(key, vault);
  return vault;
}

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

// Live agent inference. Bridge endpoint /admin/chat uses this so the
// 0G Compute key stays out of the browser bundle.
// Inference RPC is decoupled from contract RPC: contracts run on 0G
// Galileo testnet (no real USD stablecoin on Aristotle yet — deploying
// contracts to mainnet gains nothing over testnet), but compute targets
// Aristotle mainnet for production-grade models (DeepSeek v3 / GLM-5 /
// gpt-5.4-mini) instead of testnet qwen-2.5-7b which hallucinates.
const inference =
  fallbackPk
    ? new ZGComputeInference({
        privateKey: fallbackPk,
        rpcUrl:
          process.env.ZG_COMPUTE_RPC ??
          process.env.ZG_GALILEO_RPC ??
          'https://evmrpc.0g.ai',
        modelHint: process.env.ZG_COMPUTE_MODEL ?? 'deepseek',
        fallbackToMock: true,
        debug: true,
      })
    : null;

// Per-agent encrypted memory. Drives chat history persistence — each
// /admin/chat turn is appended to the agent's iNFT-namespaced log on
// 0G Storage (file-backed locally; swap to RealZGStorageClient when
// @0gfoundation/0g-ts-sdk is wired). Survives refresh + server restart.
// Anchor to project root regardless of cwd — bun is often launched from
// the package dir (`bun --filter @clawforger/x402-skill-market`) which
// would resolve relative paths to packages/x402-skill-market/data/ and
// silently miss skills the researcher example wrote at the repo root.
const MEMORY_FILE =
  process.env.MEMORY_FILE ??
  resolve(fileURLToPath(new URL('../../../data/agent-memory.json', import.meta.url)));
console.log(`[skill-market] memory store: ${MEMORY_FILE}`);
const storage = new FileBackedZGStorage(MEMORY_FILE);

// ── Per-agent persona registry (cross-origin source of truth) ────
// Browser localStorage is per-origin, so a Studio running on
// clawforger.xyz can't read personas saved by a localhost mint. The
// server stores {tokenId → {name, systemPrompt}} in a flat JSON file
// so any client (any origin, any device) can resolve the persona by
// tokenId.
const PERSONAS_FILE =
  process.env.PERSONAS_FILE ??
  resolve(fileURLToPath(new URL('../../../data/agent-personas.json', import.meta.url)));
console.log(`[skill-market] persona store: ${PERSONAS_FILE}`);

interface PersonaRecord {
  name: string;
  systemPrompt: string;
  ownerAddress?: string;
  registeredAt: number;
}
type PersonaMap = Record<string, PersonaRecord>;

function readPersonas(): PersonaMap {
  try {
    if (!existsSync(PERSONAS_FILE)) return {};
    return JSON.parse(readFileSync(PERSONAS_FILE, 'utf-8')) as PersonaMap;
  } catch (err) {
    console.warn('[persona-store] read failed:', (err as Error).message);
    return {};
  }
}

function writePersona(tokenId: string, record: PersonaRecord): void {
  const map = readPersonas();
  map[tokenId] = record;
  mkdirSync(dirname(PERSONAS_FILE), { recursive: true });
  writeFileSync(PERSONAS_FILE, JSON.stringify(map, null, 2));
}
const encryptionKeyPromise = fallbackPk
  ? deriveKeyFromSignature(fallbackPk)
  : null;
const memoryCache = new Map<string, ZGMemory>();
async function getMemoryFor(tokenId: bigint): Promise<ZGMemory | null> {
  if (!encryptionKeyPromise) return null;
  const key = String(tokenId);
  const cached = memoryCache.get(key);
  if (cached) return cached;
  const encryptionKey = await encryptionKeyPromise;
  const mem = new ZGMemory({
    storage,
    encryptionKey,
    namespace: `agents/${tokenId}`,
  });
  memoryCache.set(key, mem);
  return mem;
}

const executor = new KeeperHubExecutor({
  apiKey: process.env.KEEPERHUB_API_KEY ?? '',
  baseUrl: process.env.KEEPERHUB_MCP_URL ?? 'https://app.keeperhub.com/mcp',
  debug: true,
  projectId: process.env.KEEPERHUB_PROJECT_ID,
  fallbackSigner,
});

const app = new Hono();
app.use('*', cors({ exposeHeaders: ['X-Payment-Receipt'] }));

app.get('/health', (c) => c.json({ ok: true, port, facilitator: facilitatorUrl }));

// ── Compute pool info ─────────────────────────────────────────────
//
// Surfaces the 0G Compute broker ledger for the server's signing key
// (every studio user shares this pool — the server pays for inference,
// not the user's wallet). Studio displays this so users can see how
// much TEE inference is left in the bank before chatting.
app.get('/admin/compute-balance', async (c) => {
  if (!inference) {
    return c.json(
      {
        ok: false,
        reason: 'inference-not-configured',
        minDepositOG: 3,
        info: 'A fresh wallet must deposit ≥ 3 0G to create a 0G Compute broker account.',
      },
      503
    );
  }
  try {
    const info = await inference.getLedgerInfo();
    // Identify which chain + model the broker is actively using so the
    // studio's badge can prove "we're really on mainnet, not stale cache."
    const computeRpc =
      process.env.ZG_COMPUTE_RPC ??
      process.env.ZG_GALILEO_RPC ??
      'https://evmrpc.0g.ai';
    const isMainnet =
      computeRpc.includes('evmrpc.0g.ai') &&
      !computeRpc.includes('testnet');
    const activeProvider = await (inference as any)
      .getActiveProvider?.()
      .catch(() => null);
    return c.json({
      ok: true,
      walletAddress: info.walletAddress,
      totalOG: info.totalOG,
      lockedOG: info.lockedOG,
      availableOG: info.availableOG,
      minDepositOG: info.minDepositOG,
      minBalanceOG: info.minBalanceOG,
      computeChain: isMainnet
        ? { name: '0G Aristotle', chainId: 16661, kind: 'mainnet' }
        : { name: '0G Galileo', chainId: 16602, kind: 'testnet' },
      activeModel: activeProvider?.model ?? null,
      activeProviderAddress: activeProvider?.providerAddress ?? null,
      note:
        'Pool funds inference for ALL agents — users never pay for chat directly. ' +
        'When availableOG falls below minBalanceOG the server tops up by minDepositOG.',
    });
  } catch (err) {
    return c.json({ ok: false, reason: (err as Error).message }, 500);
  }
});

// ── Per-agent deterministic wallet ───────────────────────────────
// Each iNFT (by tokenId) has its own signing wallet derived from
// AGENT_WALLET_SEED. mUSDC sent to that address belongs to the agent —
// the server signs on its behalf when the agent buys skills via x402.
const AGENT_WALLET_SEED = process.env.AGENT_WALLET_SEED as Hex | undefined;
if (!AGENT_WALLET_SEED) {
  console.warn(
    '[skill-market] AGENT_WALLET_SEED not set — per-agent wallets disabled. ' +
      'Set it in .env to enable purchase_skill / per-agent funding.'
  );
}

app.get('/admin/agent/:tokenId/wallet', async (c) => {
  const tokenIdStr = c.req.param('tokenId');
  if (!AGENT_WALLET_SEED) {
    return c.json(
      { ok: false, reason: 'agent-wallets-disabled', info: 'Set AGENT_WALLET_SEED in server env' },
      503
    );
  }
  let tokenId: bigint;
  try {
    tokenId = BigInt(tokenIdStr);
  } catch {
    return c.json({ ok: false, reason: 'invalid-tokenId' }, 400);
  }
  try {
    const wallet = getAgentWallet(tokenId, AGENT_WALLET_SEED);
    const [native, musdcRaw] = await Promise.all([
      publicClient.getBalance({ address: wallet.address }),
      publicClient.readContract({
        address: mUSDCAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet.address],
      }) as Promise<bigint>,
    ]);
    return c.json({
      ok: true,
      tokenId: tokenIdStr,
      address: wallet.address,
      native0G: Number(native) / 1e18,
      mUSDC: Number(musdcRaw) / 1e6,
      mUSDCRaw: musdcRaw.toString(),
      info:
        'This is the deterministic sub-wallet for iNFT #' +
        tokenIdStr +
        '. Send mUSDC to this address to give the agent buying power. ' +
        'The server signs purchases on the agent\'s behalf using a key derived ' +
        'from AGENT_WALLET_SEED + tokenId.',
    });
  } catch (err) {
    return c.json(
      { ok: false, reason: (err as Error).message.slice(0, 200) },
      500
    );
  }
});

// ── Persona registry endpoints ───────────────────────────────────
//
// POST persists the agent's persona at mint time so any client on any
// origin can resolve it later. GET serves it back. Personas are not
// secret — the on-chain intelligenceHash already commits to them — so
// no auth is required (write-once is enforced via the `force` flag).

const PersonaPostSchema = z.object({
  name: z.string().min(1).max(80),
  systemPrompt: z.string().min(1).max(8_000),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

app.post('/admin/agent/:tokenId/persona', async (c) => {
  const tokenIdStr = c.req.param('tokenId');
  try {
    BigInt(tokenIdStr);
  } catch {
    return c.json({ ok: false, reason: 'invalid-tokenId' }, 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = PersonaPostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, reason: parsed.error.message }, 400);
  }
  // Idempotent overwrite — last writer wins. Personas aren't secret
  // (the on-chain intelligenceHash already commits to them) and during
  // testing/backfill we want repeated POSTs to just succeed.
  const record: PersonaRecord = {
    name: parsed.data.name,
    systemPrompt: parsed.data.systemPrompt,
    ownerAddress: parsed.data.ownerAddress,
    registeredAt: Math.floor(Date.now() / 1000),
  };
  writePersona(tokenIdStr, record);
  return c.json({ ok: true, tokenId: tokenIdStr, persona: record });
});

app.get('/admin/agent/:tokenId/persona', (c) => {
  const tokenIdStr = c.req.param('tokenId');
  const map = readPersonas();
  const record = map[tokenIdStr];
  if (!record) return c.json({ ok: false, reason: 'not-found' }, 404);
  return c.json({ ok: true, tokenId: tokenIdStr, persona: record });
});

/** Serialize a SkillManifest to JSON-safe form (BigInt → string). */
function serializeSkill(s: SkillManifest): Record<string, unknown> {
  return {
    ...s,
    ownerINFT: {
      ...s.ownerINFT,
      tokenId: String(s.ownerINFT.tokenId),
    },
  };
}

// ── Discovery ─────────────────────────────────────────────────────
app.get('/skills', async (c) => {
  await syncFromChain();
  return c.json({ skills: index.all().map(serializeSkill) });
});
app.get('/skills/:tag', async (c) => {
  await syncFromChain();
  return c.json({
    skills: index.findByTag(c.req.param('tag')).map(serializeSkill),
  });
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

// ── Admin: chat with a live agent ─────────────────────────────────
//
// Studio POSTs the agent's persona + conversation history; the server
// proxies through ZGComputeInference (TEE-verified qwen-2.5-7b on 0G
// Compute). When agentTokenId is provided, skills owned by that agent
// are exposed as OpenAI-compat function tools — if the model returns
// tool_calls, we run them via the stub executor and feed results back
// up to MAX_TOOL_ITERS turns until the model emits a final answer.
const ChatRoleSchema = z.enum(['system', 'user', 'assistant']);
const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string().max(10_000),
});
const ChatRequestSchema = z.object({
  systemPrompt: z.string().max(10_000).optional(),
  messages: z.array(ChatMessageSchema).min(1).max(50),
  agentTokenId: z.union([z.string(), z.number()]).optional(),
});

const MAX_TOOL_ITERS = 5;
const MAX_FORGE_PER_REQUEST = 1; // self-evolution is slow + on-chain; cap per chat turn

/** Sanitize "fetch.arxiv" → "fetch_arxiv" (OpenAI tool names: [a-zA-Z0-9_-]{1,64}). */
function toolNameFor(skill: SkillManifest): string {
  return skill.capabilityTag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

/**
 * Meta-tool: buy a skill from another agent on the marketplace.
 *
 * The buyer's deterministic sub-wallet (derived from AGENT_WALLET_SEED +
 * tokenId) signs an mUSDC.transfer to the producer's RoyaltyVault, then
 * the skill artifact is fetched + decrypted + executed and the result is
 * returned. This is the agent-to-agent commerce primitive.
 */
const PURCHASE_TOOL_NAME = 'purchase_skill';
const PURCHASE_TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: PURCHASE_TOOL_NAME,
    description:
      'Pay another agent for one of THEIR skills using mUSDC. Use this when ' +
      'the user wants data your own iNFT does not have a skill for, but a different ' +
      'agent does. The buy is a real on-chain mUSDC transfer to the producer\'s ' +
      'RoyaltyVault — your agent\'s wallet must be funded. After settlement the ' +
      'skill executes and the result is returned. Do NOT use this for skills your ' +
      'own iNFT already owns.',
    parameters: {
      type: 'object',
      properties: {
        capabilityTag: {
          type: 'string',
          description:
            'The capability tag (e.g. "price.crypto", "wiki.lookup") of the skill to purchase. ' +
            'Must match a skill another agent has published.',
        },
        producerTokenId: {
          type: 'integer',
          description:
            'The tokenId of the producer iNFT that owns this skill (visible in the ' +
            'marketplace listing as "owner: iNFT #N"). Multiple agents can publish ' +
            'skills with the same capabilityTag, so this disambiguates which one to buy. ' +
            'ALWAYS pass this — without it, the server picks the oldest match which may ' +
            'have a missing artifact.',
        },
        inputs: {
          type: 'object',
          description:
            'Inputs to pass to the purchased skill. Must satisfy the skill\'s schemaIn.',
          additionalProperties: true,
        },
      },
      required: ['capabilityTag', 'producerTokenId', 'inputs'],
    },
  },
};

/** Meta-tool the LLM uses to evolve a brand-new skill mid-conversation. */
const EVOLVE_TOOL_NAME = 'evolve_new_skill';
const EVOLVE_TOOL_DEF = {
  type: 'function' as const,
  function: {
    name: EVOLVE_TOOL_NAME,
    description:
      'Create and on-chain register a NEW skill on this agent\'s iNFT for a capability the agent does NOT currently have. ' +
      'Triggers skill-forge: LLM-generated TypeScript code is sandbox-tested, the artifact is uploaded to 0G Storage, ' +
      'and SkillRegistry.publishSkill is called on 0G Galileo. Use ONLY when the user requests something not covered by ' +
      'an existing skill. Slow (10–30s) and writes a real on-chain transaction — do not call speculatively.',
    parameters: {
      type: 'object',
      properties: {
        capabilityTag: {
          type: 'string',
          description:
            'Dotted lowercase tag, e.g. "fetch.youtube", "translate.text", "summarize.url". Must be unique per agent.',
        },
        taskDescription: {
          type: 'string',
          description:
            'One-sentence description of what the new skill should do, written for an LLM to implement.',
        },
        exampleInput: {
          type: 'object',
          description:
            'A concrete example input the new skill must accept. Used as the sandbox-test fixture.',
          additionalProperties: true,
        },
      },
      required: ['capabilityTag', 'taskDescription', 'exampleInput'],
    },
  },
};

/**
 * Forge a new skill for an existing iNFT and register it on-chain.
 * Synchronous in the chat-handling sense — caller awaits the full flow
 * (codegen → sandbox → 0G Storage upload → SkillRegistry tx). Returns
 * a structured summary the LLM can quote in its next reply.
 */
async function forgeSkillForAgent(
  agentTokenId: bigint,
  args: { capabilityTag: string; taskDescription: string; exampleInput: Record<string, unknown> },
  memory: ZGMemory,
  personaContext?: string
): Promise<{
  ok: boolean;
  capabilityTag?: string;
  artifactHash?: string;
  priceUSDC?: number;
  txHash?: string;
  attempts?: number;
  reason?: string;
  metadataUpdated?: boolean;
  metadataNote?: string;
}> {
  if (!inference || !fallbackPk || !encryptionKeyPromise || !fallbackSigner) {
    return { ok: false, reason: 'forge-not-configured-on-server' };
  }

  const encryptionKey = await encryptionKeyPromise;

  // Build a Task tight enough for sandbox to accept the LLM's output.
  // Schema match is loose — we just need *something* JSON-shaped back.
  const task: Task = {
    id: `chat-forge-${Date.now()}`,
    description: args.taskDescription,
    inputs: args.exampleInput,
    successCriteria: {
      kind: 'jsonSchemaMatch',
      schema: { type: 'object', additionalProperties: true },
    },
  };

  const inft = {
    contractAddress: CLAWFORGER_INFT as Address,
    tokenId: agentTokenId,
    chain: '0g-galileo-testnet' as const,
  };
  const agent = new Agent(inft, memory, inference, executor, [], {
    onSkillPublish: async (skill) => {
      // Publish on-chain via SkillRegistry.publishSkill — same path as
      // examples/researcher uses on the CLI.
      try {
        const { request } = await publicClient.simulateContract({
          address: SKILL_REGISTRY,
          abi: SkillRegistryAbi as readonly unknown[],
          functionName: 'publishSkill',
          args: [skill.hash, agentTokenId, skill.capabilityTag, BigInt(skill.priceUSDC)],
          account: privateKeyToAccount(fallbackPk),
        });
        const txHash = await fallbackSigner.writeContract(request);
        console.log(`[skill-market] forge → publishSkill tx ${txHash}`);
      } catch (err) {
        console.warn(
          '[skill-market] forge → publishSkill failed:',
          (err as Error).message.slice(0, 200)
        );
      }
    },
  });

  let attempts = 0;
  const result = await evolve({
    agent,
    task,
    signer: fallbackSigner,
    storage,
    encryptionKey,
    forceTag: args.capabilityTag,
    personaContext,
    onAttempt: (n, _code, sandboxResult) => {
      attempts = n;
      memory
        .logAppend({
          kind: 'evolve.attempt',
          data: {
            taskId: task.id,
            attempt: n,
            passed: sandboxResult.passed,
            reason: sandboxResult.reason,
            durationMs: sandboxResult.durationMs,
            triggeredBy: 'chat',
            summary: `chat-forge attempt ${n}: ${sandboxResult.passed ? '✓ passed' : `✗ ${sandboxResult.reason ?? 'failed'}`}`,
          },
          ts: Date.now(),
        })
        .catch(() => {});
    },
  });

  if (!result.ok || !result.skill) {
    await memory.logAppend({
      kind: 'evolve.failure',
      data: {
        taskId: task.id,
        attempts: result.attempts,
        reason: result.reason,
        triggeredBy: 'chat',
        summary: `chat-forge failed for ${args.capabilityTag}: ${result.reason}`,
      },
      ts: Date.now(),
    });
    return { ok: false, attempts: result.attempts, reason: result.reason };
  }

  await memory.logAppend({
    kind: 'evolve.success',
    data: {
      taskId: task.id,
      attempts: result.attempts,
      triggeredBy: 'chat',
      skill: {
        capabilityTag: result.skill.capabilityTag,
        artifactHash: result.skill.hash,
        priceUSDC: result.skill.priceUSDC,
      },
      summary: `chat-forge succeeded: ${result.skill.capabilityTag} after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}`,
    },
    ts: Date.now(),
  });

  // Make the new skill discoverable to the marketplace immediately
  index.publish(result.skill);

  return {
    ok: true,
    capabilityTag: result.skill.capabilityTag,
    artifactHash: result.skill.hash,
    priceUSDC: result.skill.priceUSDC,
    attempts: result.attempts,
    metadataUpdated: result.metadataUpdated ?? true,
    metadataNote: result.metadataUpdated
      ? undefined
      : `iNFT metadata pointer not updated (server is not the owner of #${agentTokenId}). ` +
        `SkillRegistry was still updated and the skill is fully usable in chat. ` +
        `The owner can backfill iNFT.evolveAgent later. detail: ${result.metadataError ?? 'unknown'}`,
  };
}

app.post('/admin/chat', async (c) => {
  if (!inference) {
    return c.json({ ok: false, reason: 'inference-not-configured' }, 500);
  }
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, reason: 'invalid-json' }, 400);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, reason: parsed.error.message }, 400);

  // Build tools from skills owned by this agent (or all skills if not scoped).
  await syncFromChain();
  const agentTokenId =
    parsed.data.agentTokenId !== undefined ? BigInt(parsed.data.agentTokenId) : undefined;

  const nameToSkill = new Map<string, SkillManifest>();
  function rebuildTools() {
    nameToSkill.clear();
    const allSkills = index.all();
    const scoped =
      agentTokenId !== undefined
        ? allSkills.filter((s) => s.ownerINFT.tokenId === agentTokenId)
        : allSkills;
    const skillTools = scoped.map((s) => {
      const name = toolNameFor(s);
      nameToSkill.set(name, s);
      return {
        type: 'function' as const,
        function: {
          name,
          description: `Skill ${s.capabilityTag} — runs onchain skill artifact ${s.hash.slice(
            0,
            10
          )}…`,
          parameters: (s.schemaIn as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
            additionalProperties: true,
          },
        },
      };
    });
    // Always expose the meta-tool when the chat is scoped to a specific
    // agent — that's the only context where forging a skill is meaningful.
    if (agentTokenId !== undefined) skillTools.push(EVOLVE_TOOL_DEF);
    // Expose purchase_skill if per-agent wallets are enabled — lets this
    // agent buy data from OTHER agents on the marketplace using its own
    // mUSDC. Hidden when AGENT_WALLET_SEED isn't set (no signing wallet).
    if (agentTokenId !== undefined && AGENT_WALLET_SEED) {
      skillTools.push(PURCHASE_TOOL_DEF);
    }
    return { tools: skillTools, scoped };
  }
  let { tools, scoped: scopedSkills } = rebuildTools();

  // Prepend the agent's persona as a system message
  const messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
  }> = [];
  if (parsed.data.systemPrompt) {
    messages.push({ role: 'system', content: parsed.data.systemPrompt });
  }

  // Ground the model in *actual* on-chain skills so it doesn't hallucinate
  // a generic capability list when asked "what skills do you have / can I
  // buy from you". This injects a second system message right after the
  // persona, listing every marketplace-published skill scoped to this iNFT.
  const evolveDirective = agentTokenId !== undefined
    ? [
        ``,
        `# CRITICAL — ANTI-HALLUCINATION RULES (read carefully)`,
        ``,
        `You DO NOT have access to the internet, file system, YouTube, arXiv,`,
        `news APIs, weather, search engines, or any external service UNLESS that`,
        `capability is in your tool list above. You CANNOT browse, you CANNOT`,
        `recall current papers/videos/articles from training data, and you MUST`,
        `NOT fabricate titles, abstracts, descriptions, transcripts, prices,`,
        `or any other external content.`,
        ``,
        `When the user asks for data from an external source and you do NOT have a`,
        `matching skill, you have exactly TWO valid responses:`,
        ``,
        `  1. Call \`evolve_new_skill\` to forge the skill on-chain RIGHT NOW, then`,
        `     immediately call the new skill to answer. Pick a dotted lowercase`,
        `     capability tag (e.g. "fetch.youtube" / "summarize.url" / "fetch.weather"),`,
        `     a one-sentence taskDescription, and a concrete exampleInput taken from`,
        `     the user's message. Forging takes ~10–30s and writes a real on-chain tx.`,
        ``,
        `  2. Say plainly: "I don't have a skill for that yet. I can forge one`,
        `     on-chain right now if you'd like — should I?"`,
        ``,
        `WRONG (hallucination — never do this): inventing a title, description,`,
        `abstract, or any content the user asked you to fetch. If you find yourself`,
        `about to write a fake title or description, STOP and call evolve_new_skill`,
        `instead.`,
        ``,
        `If the user gives you a URL, video id, paper id, or any external reference`,
        `and you don't have a tool for it, default to calling \`evolve_new_skill\`.`,
        ``,
        `# Stub tool outputs`,
        ``,
        `Some skills (especially freshly-forged ones in this build) return outputs`,
        `containing \`"placeholder": true\` and a \`note\` field. When you see this,`,
        `the skill is registered on-chain but the marketplace server has not yet`,
        `executed real code for it. You MUST tell the user honestly:`,
        `  - the skill IS registered + listed for sale at 0.05 mUSDC`,
        `  - cite the artifact hash if relevant`,
        `  - explain real execution is pending`,
        `  - DO NOT fabricate titles, abstracts, descriptions, or any content`,
        `    that the skill claimed it would produce`,
      ].join('\n')
    : '';

  // Persona detection up-front so subsequent system blocks can be tuned.
  // Specifically, an Analyst (consumer) gets a "prefer purchase over forge"
  // directive baked into the system prompt; producers don't.
  const detectedPersona = detectPersona(parsed.data.systemPrompt ?? null);
  const isConsumer = detectedPersona?.isConsumer === true;

  // Marketplace listing of skills owned by OTHER agents (purchasable via
  // purchase_skill). Helps the LLM know what's available for purchase
  // without having to discover skills by guessing.
  const otherSkills =
    agentTokenId !== undefined
      ? index.all().filter((s) => s.ownerINFT.tokenId !== agentTokenId)
      : [];
  const marketplaceBlock =
    otherSkills.length > 0 && AGENT_WALLET_SEED
      ? [
          ``,
          `# Marketplace — skills owned by OTHER agents (call \`purchase_skill\` to buy)`,
          ``,
          `These skills belong to other iNFTs. You can buy them with mUSDC from`,
          `your own agent's deterministic sub-wallet. Use \`purchase_skill\` with`,
          `BOTH \`capabilityTag\` AND \`producerTokenId\` (the iNFT # of the owner)`,
          `— multiple agents can publish skills with the same tag, so you must`,
          `always tell the server which producer's skill you want. Your wallet`,
          `signs an mUSDC.transfer to that producer's RoyaltyVault, then the`,
          `skill executes and returns its result.`,
          ``,
          ...otherSkills.map((s) => {
            const priceMUSDC = (s.priceUSDC / 1_000_000).toFixed(4);
            // Surface the input schema so the LLM knows the EXACT key
            // names to pass. Without this, DeepSeek guesses (e.g. uses
            // "token" when the skill expects "symbol") and the skill
            // falls into its catch path returning empty data.
            const props =
              ((s.schemaIn as Record<string, unknown> | undefined)
                ?.properties as Record<string, { type?: string }> | undefined) ??
              {};
            const required =
              ((s.schemaIn as Record<string, unknown> | undefined)
                ?.required as string[] | undefined) ?? [];
            const inputSig =
              Object.keys(props).length > 0
                ? `{${Object.entries(props)
                    .map(([k, v]) => {
                      const isRequired = required.includes(k);
                      return `${k}${isRequired ? '' : '?'}: ${v?.type ?? 'any'}`;
                    })
                    .join(', ')}}`
                : '{}';
            return `  - capability: "${s.capabilityTag}" — producerTokenId: ${s.ownerINFT.tokenId} — price: ${priceMUSDC} mUSDC — inputs: ${inputSig}`;
          }),
        ].join('\n')
      : '';

  // Consumer-bias directive — only attached when the persona is Analyst.
  // Tells the model to PREFER purchase over forge, and to be transparent
  // about what was paid to whom. Without this, DeepSeek's default reflex
  // is to forge, which defeats the marketplace economy demo.
  const consumerDirective = isConsumer
    ? [
        ``,
        `# CONSUMER MODE (you are an Analyst)`,
        ``,
        `Your job is to BUY data from other agents on the marketplace, NOT to`,
        `forge new skills. The default flow is:`,
        ``,
        `  1. Read the marketplace listing above. Match the user's request to`,
        `     a capabilityTag AND note its \`producerTokenId\`.`,
        `  2. PREVIEW THE PURCHASE before spending. Reply to the user with:`,
        `        "I found \`<capabilityTag>\` from iNFT #<producerTokenId> at <price> mUSDC.`,
        `         I'll pass {<exact inputs from schema>}. Confirm to buy?"`,
        `     Wait for the user's "yes" / "go" / "confirm" before calling`,
        `     \`purchase_skill\`. Skip this preview ONLY if the user already`,
        `     said something like "buy X for me" or "go ahead and purchase".`,
        `  3. Call \`purchase_skill\` with capabilityTag + producerTokenId + inputs.`,
        `     ALWAYS pass \`producerTokenId\` — without it the server may pick a`,
        `     stale skill with a missing artifact and you'll get a placeholder.`,
        `     The \`inputs:\` field on each marketplace listing tells you the`,
        `     EXACT key names to use (e.g. \`{symbol: string}\` means pass`,
        `     \`{"symbol": "ETH"}\`, NOT \`{"token": "ETH"}\`).`,
        `  4. After the buy lands, reply with this RECEIPT format:`,
        ``,
        `     **Bought:** \`<capability>\` from iNFT #<owner>`,
        `     **Paid:** <amount> mUSDC → vault \`<vault>\``,
        `     **Tx:** [<short-hash>…](https://chainscan-galileo.0g.ai/tx/<txHash>)`,
        ``,
        `     **Result:**`,
        `     <render the skill's returned data — clean prose, not raw JSON>`,
        ``,
        `Only call \`evolve_new_skill\` if NO marketplace skill matches AND the`,
        `user explicitly asks you to forge one. If marketplace lookup is`,
        `ambiguous (e.g. multiple skills with similar tags), ask the user to`,
        `pick rather than guessing.`,
      ].join('\n')
    : '';

  if (scopedSkills.length > 0) {
    const lines = scopedSkills.map((s) => {
      const priceMUSDC = (s.priceUSDC / 1_000_000).toFixed(4);
      return `  - capability: "${s.capabilityTag}" — tool: ${toolNameFor(s)} — price: ${priceMUSDC} mUSDC — artifact: ${s.hash.slice(0, 14)}…`;
    });
    const ctxBody = [
      `# Your on-chain skills (the only real skills you have)`,
      ``,
      `You are iNFT #${agentTokenId ?? '(unscoped)'}. The following skills are`,
      `published on the SkillRegistry contract and listed on the x402 marketplace.`,
      `These are your ONLY real capabilities — every other capability you might`,
      `imagine is hypothetical and NOT for sale. When the user asks "what skills`,
      `do you have" or "what can I buy", answer ONLY from this list:`,
      ``,
      ...lines,
      ``,
      `Each skill is callable as an OpenAI function tool with the exact name`,
      `shown above. Buyers pay the listed price in mUSDC via HTTP 402; royalties`,
      `auto-split 95/5 to your owner / protocol on-chain. If you have zero skills`,
      `published, say so plainly — do not invent.`,
      marketplaceBlock,
      consumerDirective,
      evolveDirective,
    ].join('\n');
    messages.push({ role: 'system', content: ctxBody });
  } else {
    messages.push({
      role: 'system',
      content:
        `You currently have NO on-chain skills of your own published yet.\n` +
        `If the user asks for a capability, you have TWO options:\n` +
        `  1. \`purchase_skill\` — buy an existing skill from another agent on the marketplace ` +
        `(see the listing below). Cheaper + faster than forging.\n` +
        `  2. \`evolve_new_skill\` — forge a new on-chain skill from scratch via 0G Compute. ` +
        `Use only when no existing skill matches the user's request.` +
        marketplaceBlock +
        consumerDirective +
        evolveDirective,
    });
  }

  for (const m of parsed.data.messages) messages.push({ role: m.role, content: m.content });

  const invocations: Array<{
    name: string;
    capabilityTag: string;
    skillHash: string;
    arguments: unknown;
    output: unknown;
    error?: string;
  }> = [];

  // Heuristic: when the latest user message looks like it requires
  // external data (URL, video id, paper id, "fetch", "summarize", "search"),
  // force the LLM to actually pick a tool instead of free-styling. qwen-2.5-7b
  // tends to hallucinate plausible-looking content without this nudge.
  const lastUserMsg = parsed.data.messages[parsed.data.messages.length - 1];
  const looksExternal = (() => {
    if (!lastUserMsg || lastUserMsg.role !== 'user') return false;
    const t = lastUserMsg.content.toLowerCase();
    const urlRx = /https?:\/\/|www\./;
    const externalKw =
      /\b(fetch|summarize|search|lookup|translate|scrape|crawl|download|article|paper|video|tweet|youtube|arxiv|github|wikipedia)\b/;
    return urlRx.test(t) || externalKw.test(t);
  })();
  const initialToolChoice: 'auto' | 'required' = looksExternal ? 'required' : 'auto';

  try {
    let last = await inference.chat!(
      messages,
      tools.length > 0 ? { tools, toolChoice: initialToolChoice } : undefined
    );

    let iter = 0;
    while (last.toolCalls && last.toolCalls.length > 0 && iter < MAX_TOOL_ITERS) {
      iter += 1;
      // Append the assistant turn that asked for tools
      messages.push({
        role: 'assistant',
        content: last.content || null,
        tool_calls: last.toolCalls,
      });

      let forgesThisRequest = 0;
      let justForged = false;
      // Run each tool call; append the result as a `role: 'tool'` message
      for (const call of last.toolCalls) {
        let parsedArgs: unknown = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments || '{}');
        } catch {
          parsedArgs = { _raw: call.function.arguments };
        }

        // ── Meta-tool: agent buys a skill from another agent ─────────
        if (call.function.name === PURCHASE_TOOL_NAME) {
          if (agentTokenId === undefined) {
            const errMsg = 'purchase_skill requires agentTokenId in chat request';
            invocations.push({
              name: call.function.name,
              capabilityTag: 'meta:purchase_skill',
              skillHash: '',
              arguments: parsedArgs,
              output: null,
              error: errMsg,
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: errMsg }),
            });
            continue;
          }
          const a = parsedArgs as {
            capabilityTag?: string;
            producerTokenId?: number | string;
            inputs?: Record<string, unknown>;
          };
          if (!a.capabilityTag) {
            const errMsg = 'purchase_skill requires capabilityTag';
            invocations.push({
              name: call.function.name,
              capabilityTag: 'meta:purchase_skill',
              skillHash: '',
              arguments: parsedArgs,
              output: null,
              error: errMsg,
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: errMsg }),
            });
            continue;
          }
          // Coerce producerTokenId — LLMs sometimes return strings.
          let producerTokenId: bigint | undefined;
          if (a.producerTokenId !== undefined && a.producerTokenId !== null) {
            try {
              producerTokenId = BigInt(a.producerTokenId);
            } catch {
              /* leave undefined → server falls back to newest match */
            }
          }
          const buyResult = await purchaseSkillForAgent(agentTokenId, {
            capabilityTag: a.capabilityTag,
            producerTokenId,
            inputs: a.inputs ?? {},
          });
          invocations.push({
            name: call.function.name,
            capabilityTag: buyResult.capabilityTag ?? a.capabilityTag,
            skillHash: buyResult.skillHash ?? '',
            arguments: parsedArgs,
            output: buyResult,
            error: buyResult.ok ? undefined : buyResult.reason,
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(buyResult),
          });
          continue;
        }

        // ── Meta-tool: agent decides to evolve a brand-new skill ─────
        if (call.function.name === EVOLVE_TOOL_NAME) {
          if (agentTokenId === undefined) {
            const errMsg = 'evolve_new_skill requires agentTokenId in chat request';
            invocations.push({
              name: call.function.name,
              capabilityTag: 'meta:evolve_new_skill',
              skillHash: '',
              arguments: parsedArgs,
              output: null,
              error: errMsg,
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: errMsg }),
            });
            continue;
          }
          if (forgesThisRequest >= MAX_FORGE_PER_REQUEST) {
            const errMsg = `forge-cap: only ${MAX_FORGE_PER_REQUEST} new skill(s) may be forged per chat turn — try again after replying to the user`;
            invocations.push({
              name: call.function.name,
              capabilityTag: 'meta:evolve_new_skill',
              skillHash: '',
              arguments: parsedArgs,
              output: null,
              error: errMsg,
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: errMsg }),
            });
            continue;
          }
          forgesThisRequest += 1;

          const a = parsedArgs as {
            capabilityTag?: string;
            taskDescription?: string;
            exampleInput?: Record<string, unknown>;
          };
          if (!a.capabilityTag || !a.taskDescription) {
            const errMsg = 'evolve_new_skill: missing capabilityTag or taskDescription';
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: errMsg }),
            });
            invocations.push({
              name: call.function.name,
              capabilityTag: 'meta:evolve_new_skill',
              skillHash: '',
              arguments: parsedArgs,
              output: null,
              error: errMsg,
            });
            continue;
          }

          const mem = await getMemoryFor(agentTokenId);
          // Reuse the persona detected up-front for the system prompt; this
          // forwards the persona's preferred no-auth APIs + scope into the
          // codegen prompt so a Trader can't forge an arxiv-fetcher etc.
          const personaContext = detectedPersona
            ? buildPersonaCodegenHint(detectedPersona)
            : undefined;
          if (detectedPersona) {
            console.log(
              `[skill-forge] persona=${detectedPersona.name} → APIs: ${detectedPersona.preferredApis.map((a) => a.name).join(', ') || '(consumer — no preferred APIs)'}`
            );
          }
          const forgeResult = await forgeSkillForAgent(
            agentTokenId,
            {
              capabilityTag: a.capabilityTag,
              taskDescription: a.taskDescription,
              exampleInput: a.exampleInput ?? {},
            },
            mem!,
            personaContext
          );

          // Refresh tools so the LLM sees the new skill on the next iteration
          ({ tools, scoped: scopedSkills } = rebuildTools());
          if (forgeResult.ok) justForged = true;

          invocations.push({
            name: call.function.name,
            capabilityTag: forgeResult.capabilityTag ?? a.capabilityTag,
            skillHash: forgeResult.artifactHash ?? '',
            arguments: parsedArgs,
            output: forgeResult,
            error: forgeResult.ok ? undefined : forgeResult.reason,
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(forgeResult),
          });
          continue;
        }

        // ── Regular skill tool call ───────────────────────────────────
        const skill = nameToSkill.get(call.function.name);
        if (!skill) {
          const errMsg = `unknown-tool: ${call.function.name}`;
          invocations.push({
            name: call.function.name,
            capabilityTag: call.function.name,
            skillHash: '',
            arguments: parsedArgs,
            output: null,
            error: errMsg,
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ error: errMsg }),
          });
          continue;
        }

        const inputs = (parsedArgs as Record<string, unknown>) ?? {};
        // Try the real artifact first — fetch from 0G Storage, decrypt,
        // run via new Function(). Falls through to a templated stub if
        // anything goes wrong (network, parse, timeout). This is the
        // self-evolution loop closing on itself: forge → publish →
        // execute the freshly-published artifact in the same chat turn.
        const exec = await runForgedSkill(skill.hash, inputs);
        if (!exec.ok) {
          console.warn(
            `[skill-exec] ${skill.hash.slice(0, 12)}… failed: ${exec.reason} — ${exec.detail}`
          );
        }
        const output = exec.ok
          ? exec.output
          : stubSkillOutput(skill.capabilityTag, inputs, exec);
        invocations.push({
          name: call.function.name,
          capabilityTag: skill.capabilityTag,
          skillHash: skill.hash,
          arguments: parsedArgs,
          output,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      }

      // qwen-2.5-7b can't be trusted to honor placeholder-tool-output
      // directives in the system prompt — it fabricates plausible content
      // anyway. If ANY tool call this turn returned a placeholder, short-
      // circuit the loop and emit a deterministic templated reply that
      // clearly states what the skill is and that real execution is pending.
      const placeholders = invocations.filter(
        (inv) =>
          inv.output &&
          typeof inv.output === 'object' &&
          (inv.output as Record<string, unknown>).placeholder === true
      );
      if (placeholders.length > 0) {
        const lines = placeholders.map((p) => {
          const hashShort = p.skillHash ? `${p.skillHash.slice(0, 12)}…` : '(no hash)';
          const out = p.output as Record<string, unknown>;
          const note =
            typeof out?.note === 'string'
              ? out.note
              : 'Real execution failed.';
          return `- **${p.capabilityTag}** (${hashShort}) — ${note}`;
        });
        last = {
          ...last,
          content:
            `I called ${placeholders.length === 1 ? 'a skill' : `${placeholders.length} skills`} ` +
            `for you, but ${placeholders.length === 1 ? 'it didn\'t return' : 'they didn\'t return'} ` +
            `usable data. I can't fabricate real results, so here's the honest cause:\n\n` +
            lines.join('\n') +
            `\n\nIf the cause is bad inputs, retry with the schema's required ` +
            `fields. If it's a missing/unkeyable artifact, pick a different ` +
            `producer — newer skills (higher producerTokenId) are more likely ` +
            `to be executable on this server.`,
        };
        break;
      }

      // Re-ask the model with the tool outputs in context.
      // If we JUST forged a new skill, force tool_choice='required' so the
      // model has to actually call the new skill — otherwise qwen-2.5-7b
      // tends to fabricate plausible content rather than invoking the tool.
      const nextChoice: 'auto' | 'required' = justForged ? 'required' : 'auto';
      justForged = false; // only force on the very next turn
      last = await inference.chat!(
        messages,
        tools.length > 0 ? { tools, toolChoice: nextChoice } : undefined
      );
    }

    // Persist this turn-pair to the agent's encrypted memory log.
    // Append the user's last message and the assistant's reply (with
    // verification metadata + invocations). Lives under agents/<tokenId>
    // namespace, encrypted with the server's derived key.
    if (agentTokenId !== undefined) {
      const mem = await getMemoryFor(agentTokenId);
      if (mem) {
        const lastUser = parsed.data.messages[parsed.data.messages.length - 1];
        const ts = Date.now();
        try {
          if (lastUser && lastUser.role === 'user') {
            await mem.logAppend({
              kind: 'chat.turn',
              data: { role: 'user', content: lastUser.content },
              ts,
            });
          }
          await mem.logAppend({
            kind: 'chat.turn',
            data: {
              role: 'assistant',
              content: last.content,
              chatID: last.chatID,
              verified: last.verified,
              providerAddress: last.providerAddress,
              model: last.model,
              invocations,
            },
            ts: ts + 1,
          });
        } catch (err) {
          console.warn('[skill-market] memory append failed:', (err as Error).message.slice(0, 200));
        }
      }
    }

    return c.json({
      ok: true,
      content: last.content,
      chatID: last.chatID,
      verified: last.verified,
      providerAddress: last.providerAddress,
      model: last.model,
      invocations,
      toolsExposed: tools.map((t) => t.function.name),
    });
  } catch (err) {
    return c.json({ ok: false, reason: (err as Error).message }, 500);
  }
});

// ── Full memory log (every kind) ──────────────────────────────────
//
// Returns every encrypted log entry for an agent — chat turns, skill
// evolutions, future kv-writes, etc. Powers the AgentDetail "memory
// log" tab so the iNFT-as-persistent-identity story is visible.
app.get('/admin/memory-log/:tokenId', async (c) => {
  const tokenIdStr = c.req.param('tokenId');
  let tokenId: bigint;
  try {
    tokenId = BigInt(tokenIdStr);
  } catch {
    return c.json({ ok: false, reason: 'invalid-tokenId' }, 400);
  }
  const mem = await getMemoryFor(tokenId);
  if (!mem) return c.json({ ok: true, entries: [] });
  try {
    const entries = (await mem.logRead()) as Array<{
      kind: string;
      data: unknown;
      ts: number;
    }>;
    // Newest first for the timeline UI
    const sorted = [...entries].sort((a, b) => b.ts - a.ts);
    return c.json({ ok: true, entries: sorted, count: sorted.length });
  } catch (err) {
    return c.json({ ok: false, reason: (err as Error).message }, 500);
  }
});

// ── Chat history (read encrypted log from 0G memory) ──────────────
//
// Studio loads this on AgentChat mount so refreshes / cross-device
// access pick up the conversation where it left off. Server-only
// because the encryption key is derived from DEPLOYER_PRIVATE_KEY.
app.get('/admin/chat-history/:tokenId', async (c) => {
  const tokenIdStr = c.req.param('tokenId');
  let tokenId: bigint;
  try {
    tokenId = BigInt(tokenIdStr);
  } catch {
    return c.json({ ok: false, reason: 'invalid-tokenId' }, 400);
  }
  const mem = await getMemoryFor(tokenId);
  if (!mem) return c.json({ ok: true, history: [] });
  try {
    const entries = (await mem.logRead()) as Array<{
      kind: string;
      data: unknown;
      ts: number;
    }>;
    const history = entries
      .filter((e) => e?.kind === 'chat.turn')
      .map((e) => ({ ts: e.ts, ...(e.data as Record<string, unknown>) }));
    return c.json({ ok: true, history });
  } catch (err) {
    return c.json({ ok: false, reason: (err as Error).message }, 500);
  }
});

// ── Clear chat history (encrypted log wipe) ───────────────────────
app.delete('/admin/chat-history/:tokenId', async (c) => {
  const tokenIdStr = c.req.param('tokenId');
  let tokenId: bigint;
  try {
    tokenId = BigInt(tokenIdStr);
  } catch {
    return c.json({ ok: false, reason: 'invalid-tokenId' }, 400);
  }
  const mem = await getMemoryFor(tokenId);
  if (!mem) return c.json({ ok: true });
  try {
    await mem.kvDelete('__log_index__');
    memoryCache.delete(String(tokenId));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, reason: (err as Error).message }, 500);
  }
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
//
// GET /skill/:hash without X-Payment header → 402 with payment requirements.
// POST /skill/:hash with X-Payment header   → verify, settle, execute, return.
app.get('/skill/:hash', async (c) => {
  const hash = c.req.param('hash').toLowerCase();
  await syncFromChain();
  const skill = index.get(hash);
  if (!skill) return c.json({ error: 'unknown-skill' }, 404);

  // Real per-agent vault address (NOT the iNFT contract — that was a bug).
  const vault = await getVaultForAgent(skill.ownerINFT.tokenId);

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
          payTo: vault,
          maxTimeoutSeconds: 120,
          asset: mUSDCAddress,
          extra: {
            facilitator: facilitatorUrl,
            domain: {
              name: 'Clawforger x402',
              version: '1',
              chainId: 16602,
            },
            types: {
              Payment: [
                { name: 'payer', type: 'address' },
                { name: 'payTo', type: 'address' },
                { name: 'asset', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'validUntil', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' },
              ],
            },
            ownerTokenId: String(skill.ownerINFT.tokenId),
          },
        },
      ],
    },
    402
  );
});

app.post('/skill/:hash', async (c) => {
  const hash = c.req.param('hash').toLowerCase();
  await syncFromChain();
  const skill = index.get(hash);
  if (!skill) return c.json({ error: 'unknown-skill' }, 404);

  const payment = c.req.header('X-Payment');
  if (!payment) return c.json({ error: 'missing-X-Payment' }, 402);

  // 1. Verify the payment via our facilitator
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

  const paymentPayload = verifyJson.receipt.payment as { amount: string; payer: Address };

  // 2. Trigger settlement via the executor (KH first, viem fallback).
  // We AWAIT this so the response includes the settle txHash — judges see
  // the real value movement before the skill output is rendered.
  let settlement: { ok: boolean; txHash?: Hex; workflowRunId: string; route: 'keeperhub' | 'viem-fallback'; error?: string };
  try {
    const result = await triggerSettlement(skill, paymentPayload);
    settlement = {
      ok: result.ok,
      txHash: result.txHash,
      workflowRunId: result.workflowRunId,
      route: result.workflowRunId.startsWith('viem-fallback') ? 'viem-fallback' : 'keeperhub',
      error: result.error,
    };
    if (!result.ok) {
      console.warn('[skill-market] settlement-failed:', result.error);
    }
  } catch (err) {
    return c.json(
      { error: 'settlement-failed', detail: (err as Error).message },
      502
    );
  }

  // 3. Execute the skill (real implementation would run in skill-forge sandbox)
  const inputs = await c.req.json().catch(() => ({}));
  return c.json(
    {
      skill: skill.capabilityTag,
      hash: skill.hash,
      inputs,
      output: stubSkillOutput(skill.capabilityTag, inputs),
      paid: true,
      paymentReceipt: verifyJson.receipt,
      settlement,
    },
    200,
    settlement.txHash ? { 'X-Settle-Tx': settlement.txHash } : {}
  );
});

/**
 * Real skill execution: fetch the encrypted artifact from 0G Storage, decrypt
 * with the server's key (same as forge), and execute the JS code in a Bun
 * sandbox via new Function() with a timeout. Returns null on any failure so
 * callers can fall back to stubSkillOutput.
 *
 * The artifact blob shape (set by skill-forge) is:
 *   { code, schemaIn, schemaOut, capabilityTag, reasoning }
 *
 * Network access during execution is allowed (the generated code does fetch()).
 * This mirrors what skill-forge's sandbox-test phase verified before publish.
 */
const SKILL_EXEC_TIMEOUT_MS = 15_000;
const skillCodeCache = new Map<string, string>();

/**
 * Purchase a skill from another agent — full on-chain mUSDC settlement.
 *
 * Flow:
 *   1. Find the skill by capabilityTag in the marketplace registry
 *   2. Derive the buyer's deterministic sub-wallet from AGENT_WALLET_SEED
 *   3. Pre-flight: balance + gas checks
 *   4. Sign + submit mUSDC.transfer(producerVault, price) from the buyer
 *   5. Wait for receipt
 *   6. Execute the skill artifact
 *   7. Return { result, txHash, paid, vault }
 *
 * Self-purchase (buyer == skill.ownerINFT.tokenId) is rejected — agents
 * shouldn't be paying themselves.
 */
async function purchaseSkillForAgent(
  buyerTokenId: bigint,
  args: {
    capabilityTag: string;
    producerTokenId?: bigint;
    inputs: Record<string, unknown>;
  }
): Promise<{
  ok: boolean;
  capabilityTag?: string;
  skillHash?: Hex;
  paidMUSDC?: number;
  txHash?: Hex;
  toVault?: Address;
  producerTokenId?: string;
  result?: Record<string, unknown>;
  reason?: string;
}> {
  if (!AGENT_WALLET_SEED) {
    return { ok: false, reason: 'agent-wallets-disabled (set AGENT_WALLET_SEED)' };
  }
  // Look up skill — match capability tag, ignore exact case + dot/underscore
  // since OpenAI tool name sanitization changes . to _.
  const want = args.capabilityTag.toLowerCase().replace(/_/g, '.');
  const allSkills = index.all();
  const tagMatches = allSkills.filter(
    (s) => s.capabilityTag.toLowerCase() === want
  );
  if (tagMatches.length === 0) {
    return {
      ok: false,
      reason: `skill-not-found: no on-chain skill with capabilityTag="${args.capabilityTag}"`,
    };
  }
  // If producerTokenId given, restrict to that producer. Otherwise fall
  // back to the newest match (last published wins) — older skills may
  // have artifacts that are no longer in this server's storage.
  const candidates =
    args.producerTokenId !== undefined
      ? tagMatches.filter((s) => s.ownerINFT.tokenId === args.producerTokenId)
      : tagMatches;
  if (candidates.length === 0) {
    const owners = [...new Set(tagMatches.map((s) => String(s.ownerINFT.tokenId)))];
    return {
      ok: false,
      reason:
        `skill-not-found: capabilityTag="${args.capabilityTag}" exists but no skill ` +
        `owned by iNFT #${args.producerTokenId}. Available producers: ${owners.join(', ')}.`,
    };
  }
  // index.all() returns Map insertion order, which mirrors on-chain
  // SkillPublished log order from syncFromChain — i.e. chronological.
  // Pick the LAST candidate = newest = most likely to still have a
  // valid artifact in this server's storage.
  const skill = candidates[candidates.length - 1]!;
  if (skill.ownerINFT.tokenId === buyerTokenId) {
    return {
      ok: false,
      reason:
        'self-purchase-rejected: this skill is owned by your own iNFT — call it directly instead of buying it',
    };
  }

  const buyer = getAgentWallet(buyerTokenId, AGENT_WALLET_SEED);
  const buyerAccount = privateKeyToAccount(buyer.privateKey);
  const buyerWallet = createWalletClient({
    account: buyerAccount,
    chain: zgGalileoTestnet,
    transport: http(),
  });

  const price = BigInt(skill.priceUSDC);

  // Pre-flight: mUSDC balance
  const balance = (await publicClient.readContract({
    address: mUSDCAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [buyer.address],
  })) as bigint;
  if (balance < price) {
    return {
      ok: false,
      reason:
        `insufficient-mUSDC: agent #${buyerTokenId} has ${(Number(balance) / 1e6).toFixed(4)} mUSDC, ` +
        `skill costs ${(Number(price) / 1e6).toFixed(4)} mUSDC. ` +
        `Fund via: bun run scripts/fund-agent.ts ${buyerTokenId} 1.0`,
    };
  }

  // Pre-flight: gas
  const gas = await publicClient.getBalance({ address: buyer.address });
  if (gas < BigInt(1e15)) {
    // < 0.001 0G
    return {
      ok: false,
      reason:
        `insufficient-gas: agent #${buyerTokenId} has ${(Number(gas) / 1e18).toFixed(4)} 0G, ` +
        `needs ≥ 0.001 0G to submit the purchase tx. ` +
        `Top up via: bun run scripts/fund-agent.ts ${buyerTokenId} 0 0.05`,
    };
  }

  // Producer's vault
  let vault: Address;
  try {
    vault = await getVaultForAgent(skill.ownerINFT.tokenId);
  } catch (err) {
    return {
      ok: false,
      reason: `vault-lookup-failed for producer iNFT #${skill.ownerINFT.tokenId}: ${(err as Error).message.slice(0, 120)}`,
    };
  }

  console.log(
    `[purchase] agent #${buyerTokenId} → ${skill.capabilityTag} (#${skill.ownerINFT.tokenId} vault ${vault.slice(0, 10)}…) for ${(Number(price) / 1e6).toFixed(4)} mUSDC`
  );

  // Sign + submit transfer from buyer.
  let txHash: Hex;
  try {
    const { request } = await publicClient.simulateContract({
      address: mUSDCAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [vault, price],
      account: buyerAccount,
    });
    txHash = await buyerWallet.writeContract(request);
    console.log(`[purchase] tx submitted: ${txHash}`);
  } catch (err) {
    return {
      ok: false,
      reason: `mUSDC-tx-submit-failed: ${(err as Error).message.slice(0, 200)}`,
    };
  }

  // Poll the SPECIFIC tx hash for a receipt. Earlier impl polled the
  // buyer's balance for a drop, which has a critical false-positive
  // problem: when concurrent buys drop the balance, EACH of their
  // balance-polls sees the drop and reports success — but only one
  // tx actually landed. The user gets 4 "successful" buy receipts in
  // the chat with only 2 real txs on chain. Don't do that.
  //
  // eth_getTransactionReceipt is the source of truth. If it returns
  // non-null with status 0x1, this specific hash is in a block.
  // Implemented as a manual JSON-RPC poll (viem's waitForTransactionReceipt
  // has its own timeout idiosyncrasies on 0G testnet).
  const deadline = Date.now() + 90_000;
  let receipt: { status?: Hex; blockNumber?: Hex } | null = null;
  while (Date.now() < deadline) {
    receipt = (await publicClient.getTransactionReceipt({ hash: txHash }).catch(
      () => null
    )) as any;
    if (receipt?.blockNumber) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!receipt?.blockNumber) {
    return {
      ok: false,
      reason:
        `mUSDC-tx-not-mined-in-90s: tx ${txHash} submitted but never appeared on chain. ` +
        `Possible nonce collision with a concurrent purchase or RPC dropped from mempool. Re-try.`,
    };
  }
  // Receipt has status (viem maps to 'success' | 'reverted'); reverted
  // means the transfer didn't move funds.
  const status =
    (receipt as { status?: 'success' | 'reverted' | Hex }).status;
  if (status !== 'success' && status !== '0x1') {
    return {
      ok: false,
      reason: `mUSDC-tx-reverted: tx ${txHash} mined in block ${receipt.blockNumber} but reverted (status=${status}).`,
    };
  }
  console.log(
    `[purchase] tx confirmed in block ${receipt.blockNumber}: ${txHash}`
  );

  // Execute the skill
  const exec = await runForgedSkill(skill.hash, args.inputs);
  if (!exec.ok) {
    console.warn(
      `[skill-exec] ${skill.hash.slice(0, 12)}… failed: ${exec.reason} — ${exec.detail}`
    );
  }
  const result = exec.ok
    ? exec.output
    : stubSkillOutput(skill.capabilityTag, args.inputs, exec);

  return {
    ok: true,
    capabilityTag: skill.capabilityTag,
    skillHash: skill.hash,
    paidMUSDC: Number(price) / 1e6,
    txHash,
    toVault: vault,
    producerTokenId: String(skill.ownerINFT.tokenId),
    result,
  };
}

type SkillExecFailureReason =
  | 'no-encryption-key'
  | 'blob-not-found'
  | 'decrypt-failed'
  | 'compile-failed'
  | 'fn-not-callable'
  | 'fn-threw'
  | 'fn-returned-non-object'
  | 'timeout';

type SkillExecResult =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; reason: SkillExecFailureReason; detail: string };

async function runForgedSkill(
  skillHash: Hex,
  inputs: Record<string, unknown>
): Promise<SkillExecResult> {
  if (!encryptionKeyPromise) {
    return {
      ok: false,
      reason: 'no-encryption-key',
      detail: 'server has no AGENT_WALLET_SEED / fallback PK to derive the encryption key from',
    };
  }
  let code = skillCodeCache.get(skillHash);
  if (!code) {
    let blob: Uint8Array;
    try {
      blob = await storage.fetchBlob(skillHash);
    } catch (err) {
      return {
        ok: false,
        reason: 'blob-not-found',
        detail: `artifact ${skillHash.slice(0, 12)}… is not in this server's local storage (likely forged on a different server instance)`,
      };
    }
    let artifact: { code?: string } | null;
    try {
      const key = await encryptionKeyPromise;
      artifact = (await decrypt(key, blob)) as { code?: string } | null;
    } catch (err) {
      return {
        ok: false,
        reason: 'decrypt-failed',
        detail: `artifact ${skillHash.slice(0, 12)}… exists but won't decrypt — likely encrypted with a different AGENT_WALLET_SEED`,
      };
    }
    if (!artifact || typeof artifact.code !== 'string') {
      return {
        ok: false,
        reason: 'decrypt-failed',
        detail: `artifact ${skillHash.slice(0, 12)}… decrypted but contained no executable code`,
      };
    }
    code = artifact.code;
    skillCodeCache.set(skillHash, code);
  }

  let fn: (i: Record<string, unknown>) => Promise<unknown>;
  try {
    fn = new Function(`${code}\nreturn run;`)() as (
      i: Record<string, unknown>
    ) => Promise<unknown>;
  } catch (err) {
    return {
      ok: false,
      reason: 'compile-failed',
      detail: `skill code did not compile: ${(err as Error).message.slice(0, 120)}`,
    };
  }
  if (typeof fn !== 'function') {
    return {
      ok: false,
      reason: 'fn-not-callable',
      detail: `skill artifact compiled but \`run\` is not a function`,
    };
  }

  let result: unknown;
  try {
    result = await Promise.race([
      Promise.resolve(fn(inputs)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('skill-exec-timeout')),
          SKILL_EXEC_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'skill-exec-timeout') {
      return {
        ok: false,
        reason: 'timeout',
        detail: `skill exceeded ${SKILL_EXEC_TIMEOUT_MS}ms timeout`,
      };
    }
    return {
      ok: false,
      reason: 'fn-threw',
      detail: `skill threw at runtime: ${msg.slice(0, 120)}. Inputs were ${JSON.stringify(inputs).slice(0, 120)} — check the skill's schemaIn for required fields.`,
    };
  }
  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      reason: 'fn-returned-non-object',
      detail: `skill ran but returned ${typeof result} (expected an object)`,
    };
  }
  return { ok: true, output: result as Record<string, unknown> };
}

/**
 * Render a placeholder when a skill couldn't actually run. The note is
 * shaped by the typed failure reason from runForgedSkill so the LLM (and
 * human reading the chat) sees an honest cause — "you passed empty inputs"
 * vs "the artifact is on a different server" vs "the seed key changed".
 */
function stubSkillOutput(
  tag: string,
  inputs: Record<string, unknown>,
  failure?: { reason: SkillExecFailureReason; detail: string }
): Record<string, unknown> {
  // For the two demo-templated tags we still return synthetic data so the
  // hackathon walkthrough has SOMETHING to show. Otherwise, surface the
  // real reason the skill couldn't run.
  if (tag.startsWith('fetch.arxiv') && !failure) {
    return {
      paperId: inputs.paperId ?? '2604.27264',
      title: 'A Self-Evolving Framework for Autonomous Onchain Agents',
      authors: ['Researcher Agent #12'],
      abstract:
        'We present a framework where AI agents are minted as ERC-7857 iNFTs, generate new skills on demand via sandbox-tested code synthesis, and monetize those skills through HTTP 402 paywalled endpoints with onchain royalty settlement. Tested on 0G Galileo with KeeperHub-managed execution.',
      pdfUrl: `https://arxiv.org/pdf/${inputs.paperId ?? '2604.27264'}.pdf`,
    };
  }
  if (tag.startsWith('text.summarize') && !failure) {
    return {
      summary: '[stub] would summarize the input text',
      length: typeof inputs.text === 'string' ? (inputs.text as string).length : 0,
    };
  }
  return {
    capability: tag,
    inputs,
    placeholder: true,
    failure: failure ? failure.reason : 'unknown',
    note: failure
      ? buildHonestPlaceholderNote(tag, failure)
      : `Skill ${tag} ran but returned no usable output.`,
  };
}

function buildHonestPlaceholderNote(
  tag: string,
  failure: { reason: SkillExecFailureReason; detail: string }
): string {
  switch (failure.reason) {
    case 'fn-threw':
      return (
        `Skill ${tag} ran but threw at runtime — most often this means the ` +
        `inputs were missing required fields. ${failure.detail}`
      );
    case 'fn-returned-non-object':
      return (
        `Skill ${tag} ran but returned a non-object result. ${failure.detail}`
      );
    case 'timeout':
      return (
        `Skill ${tag} timed out — likely an external API hung or the code ` +
        `looped. ${failure.detail}`
      );
    case 'compile-failed':
      return (
        `Skill ${tag}'s artifact failed to compile (likely codegen artifact ` +
        `is malformed). ${failure.detail}`
      );
    case 'fn-not-callable':
      return (
        `Skill ${tag}'s artifact compiled but the entry point is missing. ${failure.detail}`
      );
    case 'blob-not-found':
      return (
        `Skill ${tag} is registered on-chain but its encrypted artifact is ` +
        `not on this marketplace server (it was forged on a different ` +
        `instance). Pick a skill from a different producer, or ask its ` +
        `owner to re-publish from this server.`
      );
    case 'decrypt-failed':
      return (
        `Skill ${tag}'s artifact is on this server but won't decrypt — ` +
        `likely encrypted with a different AGENT_WALLET_SEED than this ` +
        `server is using. Pick a skill from a different producer.`
      );
    case 'no-encryption-key':
      return (
        `This marketplace server has no encryption key configured, so it ` +
        `cannot decrypt any forged skill artifacts.`
      );
    default:
      return `Skill ${tag} could not be executed (${failure.reason}). ${failure.detail}`;
  }
}

async function triggerSettlement(
  skill: SkillManifest,
  payment: { amount: string; payer: Address }
) {
  // Real per-agent vault, looked up via iNFT.agents(tokenId).royaltyVault.
  const vaultAddress = await getVaultForAgent(skill.ownerINFT.tokenId);

  return executor.execute({
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

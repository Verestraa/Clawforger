/**
 * Canonical shared types for the Clawforger framework.
 *
 * Every package re-exports from here. Do NOT define a Memory, Inference, or
 * Executor interface in any other package — they all live here so the
 * runtime stays decoupled from any one provider.
 */

import type { Address, Hex } from 'viem';

// ──────────────────────────────────────────────────────────────────
// Chains — Clawforger is 0G-only, no second chain
// ──────────────────────────────────────────────────────────────────

export type ZGChain = '0g-galileo-testnet' | '0g-aristotle';

// ──────────────────────────────────────────────────────────────────
// iNFT
// ──────────────────────────────────────────────────────────────────

export interface INFTRef {
  contractAddress: Address;
  tokenId: bigint;
  chain: ZGChain;
}

export interface AgentData {
  intelligenceHash: Hex;
  skillManifestHash: Hex;
  memoryRootHash: Hex;
  royaltyVault: Address;
  evolvedAt: number; // unix seconds
}

// ──────────────────────────────────────────────────────────────────
// Skills
// ──────────────────────────────────────────────────────────────────

export interface SkillManifest {
  /** 0G Storage content hash of the skill artifact */
  hash: Hex;
  /** Dotted capability tag, e.g. "fetch.arxiv" */
  capabilityTag: string;
  /** JSON Schema for input */
  schemaIn: Record<string, unknown>;
  /** JSON Schema for output */
  schemaOut: Record<string, unknown>;
  /** x402 paywall price in mUSDC base units (6 decimals) */
  priceUSDC: number;
  /** iNFT that owns this skill */
  ownerINFT: INFTRef;
}

// ──────────────────────────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────────────────────────

export type SuccessCriteria =
  | { kind: 'jsonSchemaMatch'; schema: Record<string, unknown> }
  | { kind: 'stringContains'; s: string }
  | { kind: 'lambda'; fn: (output: unknown) => boolean };

export interface Task {
  id: string;
  description: string;
  inputs: Record<string, unknown>;
  successCriteria: SuccessCriteria;
}

export interface Result {
  ok: boolean;
  output?: unknown;
  reason?: string;
  /** Skill that handled the task, if any */
  skillUsed?: SkillManifest;
}

// ──────────────────────────────────────────────────────────────────
// Memory — implemented by @clawforger/memory-0g
// ──────────────────────────────────────────────────────────────────

export interface Memory {
  kvGet(key: string): Promise<unknown | null>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvDelete(key: string): Promise<void>;
  /** Append an immutable log entry. Returns the 0G Storage content hash. */
  logAppend(entry: { kind: string; data: unknown; ts: number }): Promise<Hex>;
  logRead(opts?: { from?: number; to?: number }): Promise<unknown[]>;
}

// ──────────────────────────────────────────────────────────────────
// Inference — implemented by @clawforger/core/inference (0G Compute)
// ──────────────────────────────────────────────────────────────────

export interface InferenceOpts {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Force JSON output (model-dependent) */
  jsonMode?: boolean;
}

export interface CodeGenOpts {
  task: Task;
  existingSkills: SkillManifest[];
  style: 'typescript-bun-isolate';
}

export interface CodeGenResult {
  /** Source code for the new skill */
  code: string;
  /** Suggested capability tag */
  suggestedTag: string;
  /** Inferred input schema */
  schemaIn: Record<string, unknown>;
  /** Inferred output schema */
  schemaOut: Record<string, unknown>;
  /** Reasoning trace from the LLM */
  reasoning?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  /** The assistant's reply content. */
  content: string;
  /** TEE chatID returned by the provider — used to verify the response. */
  chatID: string | null;
  /** Whether broker.inference.processResponse(chatID) returned valid. */
  verified: boolean;
  /** Address of the provider that served the request. */
  providerAddress: string;
  /** Model that handled the request, e.g. "qwen/qwen-2.5-7b-instruct". */
  model: string;
  /** Full URL of the provider's chat endpoint. */
  endpoint: string;
}

export interface Inference {
  generate(opts: InferenceOpts): Promise<string>;
  /**
   * Multi-message chat with TEE-verification metadata. Implementations
   * may pass through to generate() for backward compat.
   */
  chat?(messages: ChatMessage[]): Promise<ChatResult>;
  generateCode(opts: CodeGenOpts): Promise<CodeGenResult>;
}

// ──────────────────────────────────────────────────────────────────
// Execution — implemented by @clawforger/keeperhub-execute
// ──────────────────────────────────────────────────────────────────

export interface ExecutionStep {
  to: Address;
  data?: Hex;
  value?: bigint;
  abi?: readonly unknown[];
  functionName?: string;
  args?: readonly unknown[];
}

export interface ExecutionIntent {
  kind: 'contractCall' | 'erc20Transfer' | 'nativeTransfer' | 'multistep';
  /** All onchain action is on 0G — no second chain */
  chain: ZGChain;
  steps: readonly ExecutionStep[];
  /** Optional human label for KeeperHub run history */
  label?: string;
}

export interface TxResult {
  ok: boolean;
  txHash?: Hex;
  blockNumber?: bigint;
  gasUsed?: bigint;
  retries: number;
  /** KeeperHub run identifier — link to dashboard */
  workflowRunId: string;
  error?: string;
}

export interface Executor {
  execute(intent: ExecutionIntent): Promise<TxResult>;
}

// ──────────────────────────────────────────────────────────────────
// Hooks — wire-points for plugins
// ──────────────────────────────────────────────────────────────────

export interface Hooks {
  beforeInference?: (task: Task) => Promise<void> | void;
  afterInference?: (task: Task, output: string) => Promise<void> | void;
  beforeExecute?: (intent: ExecutionIntent) => Promise<void> | void;
  afterExecute?: (intent: ExecutionIntent, result: TxResult) => Promise<void> | void;
  /** Fired when skill-forge succeeds. Execution agent's hook publishes to x402 marketplace. */
  onSkillPublish?: (skill: SkillManifest) => Promise<void> | void;
  /** Fired when an agent evolves (gains a skill or updates personality) */
  onEvolve?: (newSkill: SkillManifest) => Promise<void> | void;
}

// ──────────────────────────────────────────────────────────────────
// x402 — payment payload shape (used across packages)
// ──────────────────────────────────────────────────────────────────

export interface X402PaymentRequirement {
  scheme: 'exact';
  network: ZGChain;
  /** mUSDC base units (6 decimals) as decimal string */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: Record<string, unknown>;
}

export interface X402PaymentPayload {
  scheme: 'exact';
  network: ZGChain;
  payer: Address;
  payTo: Address;
  asset: Address;
  /** mUSDC base units as decimal string */
  amount: string;
  /** Unix seconds */
  validUntil: number;
  /** Random unique nonce */
  nonce: Hex;
  /** EIP-712 signature over the payload */
  signature: Hex;
}

export interface X402Receipt {
  payment: X402PaymentPayload;
  /** Facilitator signature attesting verification */
  facilitatorSig: Hex;
  /** When the facilitator verified */
  verifiedAt: number;
}

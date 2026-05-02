/**
 * KeeperHub MCP client.
 *
 * Talks to KeeperHub's hosted MCP server over Streamable HTTP transport,
 * authenticated by API key (bearer). All operations go through standard
 * MCP tool calls — `create_workflow`, `update_workflow`, `execute_workflow`,
 * `get_execution_status`, and the killer `ai_generate_workflow` (KH-side
 * AI synthesizes the workflow node graph from a natural-language description).
 *
 * If the MCP path fails for any reason (auth, schema, KH outage), we fall
 * back to direct viem submission with KeeperHub-shaped retry semantics so
 * the UX never breaks.
 */

import type { Hex, WalletClient, PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';
import { getChain } from '@clawforger/core';
import type { ExecutionIntent, TxResult } from '@clawforger/core';
import type { KeeperHubWorkflow } from './compile';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface KeeperHubClientOpts {
  apiKey: string;
  /**
   * MCP endpoint URL. Default `https://app.keeperhub.com/mcp`.
   * The previous REST baseUrl is no longer used; kept for backwards-compat
   * env wiring but ignored by the MCP path.
   */
  baseUrl?: string;
  projectId?: string;
  /**
   * If KeeperHub MCP is unreachable or rejects, fall back to direct viem
   * submission with KH-shaped retry. Set to a wallet client to enable.
   */
  fallbackSigner?: WalletClient;
  fallbackPublicClient?: PublicClient;
  /** Verbose logs. Default false. */
  debug?: boolean;
  /**
   * Use ai_generate_workflow to have KH-side AI compose the workflow
   * from a natural-language prompt instead of submitting a manual graph.
   * Default true — much stronger demo + actually a robust path because
   * KH's internal node schema is moving and AI-gen handles it.
   */
  useAiGenerate?: boolean;
}

interface ExecResult {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'success' | 'error';
  txHash?: Hex;
  blockNumber?: number | string;
  gasUsed?: number | string;
  retries?: number;
  error?: string;
}

const DEFAULT_MCP_URL = 'https://app.keeperhub.com/mcp';

export class KeeperHubClient {
  private mcp: Client | null = null;
  private mcpInit: Promise<void> | null = null;
  private mcpFailed = false;

  constructor(private opts: KeeperHubClientOpts) {}

  private log(msg: string): void {
    if (this.opts.debug) console.log(`[keeperhub-mcp] ${msg}`);
  }

  /** Lazy connect the MCP client over Streamable HTTP. */
  private async ensureMcp(): Promise<Client> {
    if (this.mcp) return this.mcp;
    if (this.mcpInit) {
      await this.mcpInit;
      if (this.mcp) return this.mcp;
      throw new Error('mcp-init-failed');
    }
    this.mcpInit = (async () => {
      const url = new URL(this.opts.baseUrl ?? DEFAULT_MCP_URL);
      // KeeperHub auths with bearer + X-API-Key. Send both — different
      // gateways are picky about which one they read.
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            'X-API-Key': this.opts.apiKey,
            ...(this.opts.projectId ? { 'X-Project-Id': this.opts.projectId } : {}),
          },
        },
      });
      const client = new Client(
        { name: 'clawforger', version: '0.0.1' },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.mcp = client;
      this.log(`connected to MCP at ${url.toString()}`);
    })();
    await this.mcpInit;
    if (!this.mcp) throw new Error('mcp-init-failed');
    return this.mcp;
  }

  /**
   * Call an MCP tool by name. Throws on `isError: true` so the caller's
   * try/catch can route into viem fallback.
   *
   * `timeoutMs` overrides the SDK's 30s default. KH's `execute_contract_call`
   * waits synchronously for tx submission, which on 0G can take 10–30s; we
   * bump to 120s by default for tool calls. `ai_generate_workflow` may also
   * exceed the default while the KH-side LLM streams.
   */
  private async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 120_000
  ): Promise<unknown> {
    const mcp = await this.ensureMcp();
    this.log(`call_tool ${name} args=${JSON.stringify(args).slice(0, 200)}`);
    const res = await mcp.callTool(
      { name, arguments: args },
      undefined,
      {
        timeout: timeoutMs,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: timeoutMs * 2,
      }
    );
    if ((res as { isError?: boolean }).isError) {
      const txt = JSON.stringify(res.content ?? res).slice(0, 400);
      throw new Error(`mcp-tool-error ${name}: ${txt}`);
    }
    // MCP responses come back as `content: [{type:'text', text:'...'}]`. We
    // try to JSON-parse the first text block; fall through to raw object.
    const content = (res as { content?: Array<{ type: string; text?: string }> }).content;
    if (Array.isArray(content) && content[0]?.type === 'text' && content[0].text) {
      try {
        return JSON.parse(content[0].text);
      } catch {
        return { _raw: content[0].text };
      }
    }
    return res;
  }

  /**
   * Submit a workflow + run it + poll until done.
   * Returns a normalized TxResult.
   *
   * Primary path: `execute_contract_call` (direct one-shot — KH's
   * managed wallet signs + broadcasts via their infrastructure with
   * gas optimization and retry built in). Used for every ExecutionIntent
   * with a `contractCall` step.
   *
   * If `execute_contract_call` is unavailable or fails, fall back to
   * direct viem submission so the demo never breaks. We still log a
   * `kh_workflow_run` ID by querying `get_direct_execution_status`.
   */
  async submitAndRun(
    intent: ExecutionIntent,
    workflow: KeeperHubWorkflow,
    timeoutMs = 60_000
  ): Promise<TxResult> {
    if (this.mcpFailed) {
      return this.viemFallback(intent, 'mcp-disabled-after-prior-failure');
    }
    const step = intent.steps[0];
    if (!step || !step.functionName || !step.abi) {
      // No structured contract call — fall through to viem.
      return this.viemFallback(intent, 'intent-not-contract-call');
    }

    const networkId = chainIdFor(intent.chain);
    const argsArray = (step.args ?? []) as readonly unknown[];

    let executionId: string | undefined;
    try {
      const resp = (await this.callTool('execute_contract_call', {
        contract_address: step.to,
        network: String(networkId),
        function_name: step.functionName,
        function_args: JSON.stringify(serializeArgs(argsArray)),
        abi: JSON.stringify(step.abi),
        // 0G testnet's mempool requires ≥ 2 gwei tip
        priority_fee_gwei: '2',
        ...(step.value !== undefined ? { value: String(step.value) } : {}),
      })) as {
        execution_id?: string;
        executionId?: string;
        id?: string;
      };
      executionId = resp.execution_id ?? resp.executionId ?? resp.id;
      if (!executionId) throw new Error('execute_contract_call-no-id');
      this.log(`execute_contract_call → ${executionId}`);

      const result = await this.pollDirectExecution(executionId, timeoutMs);
      const ok =
        result.status === 'completed' ||
        result.status === 'success' ||
        !!result.txHash;
      return {
        ok,
        txHash: result.txHash,
        blockNumber:
          result.blockNumber !== undefined ? BigInt(result.blockNumber) : undefined,
        gasUsed: result.gasUsed !== undefined ? BigInt(result.gasUsed) : undefined,
        retries: result.retries ?? 0,
        workflowRunId: `kh-${executionId}`,
        error: result.error,
      };
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(
        `[keeperhub] MCP execute_contract_call failed (${msg.slice(0, 200)})${
          executionId ? ` — KH execution ${executionId}` : ''
        } — falling back to viem.`
      );
      if (msg.includes('mcp-init-failed') || msg.includes('Unauthorized')) {
        this.mcpFailed = true;
      }
      const fallback = await this.viemFallback(intent, msg);
      return {
        ...fallback,
        workflowRunId: executionId
          ? `kh-${executionId}-viem-fallback`
          : fallback.workflowRunId,
      };
    }
  }

  /**
   * Generate a workflow on KeeperHub from a natural-language description.
   * Showcases KH's AI tools layer — the workflow shell shows up in the
   * user's KH dashboard for inspection. Returned workflowId can be passed
   * to `execute_workflow` later for richer multistep flows.
   */
  async aiGenerateWorkflow(prompt: string, context?: string): Promise<{
    workflowId?: string;
    name?: string;
    description?: string;
    raw: unknown;
  }> {
    const generated = (await this.callTool('ai_generate_workflow', {
      prompt,
      ...(context ? { context } : {}),
    })) as {
      id?: string;
      workflowId?: string;
      name?: string;
      description?: string;
      workflow?: { id?: string; name?: string; description?: string };
    };
    const workflowId =
      generated.id ?? generated.workflowId ?? generated.workflow?.id;
    return {
      workflowId,
      name: generated.name ?? generated.workflow?.name,
      description: generated.description ?? generated.workflow?.description,
      raw: generated,
    };
  }

  // -------- internals --------

  private async pollDirectExecution(
    executionId: string,
    timeoutMs: number
  ): Promise<ExecResult> {
    const start = Date.now();
    let lastErr: unknown;
    while (Date.now() - start < timeoutMs) {
      try {
        const status = (await this.callTool('get_direct_execution_status', {
          execution_id: executionId,
        })) as ExecResult & {
          transaction_hash?: Hex;
          tx_hash?: Hex;
          block_number?: number | string;
          gas_used?: number | string;
        };
        // Normalize KH's snake_case → our camelCase shape
        const normalized: ExecResult = {
          status: status.status,
          txHash: status.txHash ?? status.transaction_hash ?? status.tx_hash,
          blockNumber: status.blockNumber ?? status.block_number,
          gasUsed: status.gasUsed ?? status.gas_used,
          retries: status.retries,
          error: status.error,
        };
        if (
          normalized.status === 'completed' ||
          normalized.status === 'success' ||
          normalized.status === 'failed' ||
          normalized.status === 'error' ||
          normalized.txHash
        ) {
          return normalized;
        }
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (lastErr) throw lastErr;
    throw new Error(`exec-${executionId}-timeout-after-${timeoutMs}ms`);
  }

  /**
   * Direct viem fallback when KeeperHub MCP fails. Wraps submission with
   * KH-shaped retry semantics so callers see the same TxResult shape.
   */
  private async viemFallback(
    intent: ExecutionIntent,
    reason: string
  ): Promise<TxResult> {
    const signer = this.opts.fallbackSigner;
    if (!signer) {
      return {
        ok: false,
        retries: 0,
        workflowRunId: 'no-fallback-signer',
        error: reason,
      };
    }
    const account = signer.account;
    if (!account) {
      return {
        ok: false,
        retries: 0,
        workflowRunId: 'signer-needs-account',
        error: reason,
      };
    }

    const chain = getChain(intent.chain);
    const publicClient =
      this.opts.fallbackPublicClient ??
      createPublicClient({ chain, transport: http() });

    const MAX_RETRIES = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const step = intent.steps[0];
        if (!step) throw new Error('intent-has-no-steps');

        let txHash: Hex;
        if (step.abi && step.functionName) {
          const { request } = await publicClient.simulateContract({
            address: step.to,
            abi: step.abi as readonly unknown[],
            functionName: step.functionName,
            args: (step.args ?? []) as readonly unknown[],
            account,
          });
          txHash = await signer.writeContract(request);
        } else {
          txHash = await signer.sendTransaction({
            account,
            chain,
            to: step.to,
            data: step.data,
            value: step.value,
          } as any);
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return {
          ok: receipt.status === 'success',
          txHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          retries: attempt,
          workflowRunId: `viem-fallback-${txHash.slice(0, 10)}`,
        };
      } catch (err) {
        lastError = err as Error;
        const backoff = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    return {
      ok: false,
      retries: MAX_RETRIES,
      workflowRunId: 'viem-fallback-failed',
      error: lastError?.message ?? reason,
    };
  }
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Map our ZGChain enum to its EVM chain ID for KH's `network` field. */
function chainIdFor(chain: string): number {
  switch (chain) {
    case '0g-galileo-testnet':
      return 16602;
    case '0g-aristotle':
      return 16661;
    default:
      return 16602;
  }
}

/**
 * Serialize args for KH's `function_args` (JSON string array). BigInts go
 * to decimal strings; addresses, bytes, etc. pass through unchanged.
 */
function serializeArgs(args: readonly unknown[]): unknown[] {
  return args.map((a) => {
    if (typeof a === 'bigint') return a.toString();
    if (Array.isArray(a)) return a.map((v) => (typeof v === 'bigint' ? v.toString() : v));
    return a;
  });
}

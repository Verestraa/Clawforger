/**
 * KeeperHub MCP client.
 *
 * Talks to KeeperHub's REST API (which the MCP server exposes). For the
 * hackathon we use REST directly — easier to debug than wiring an MCP client.
 *
 * If KeeperHub does not yet support 0G Galileo as a chain, this module logs
 * the gap and falls through to direct viem submission with KeeperHub-shaped
 * retry semantics. Document this in FEEDBACK.md as a feature request.
 */

import type { Hex, WalletClient, PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';
import { getChain } from '@clawforger/core';
import type { ExecutionIntent, TxResult } from '@clawforger/core';
import type { KeeperHubWorkflow } from './compile';

export interface KeeperHubClientOpts {
  apiKey: string;
  baseUrl: string;        // e.g. https://api.keeperhub.com
  projectId?: string;
  /**
   * If KeeperHub doesn't support 0G yet, fall back to direct viem submission
   * with retry. Set to a wallet client to enable.
   */
  fallbackSigner?: WalletClient;
  fallbackPublicClient?: PublicClient;
}

interface RunResult {
  status: 'pending' | 'completed' | 'failed';
  txHash?: Hex;
  blockNumber?: number;
  gasUsed?: string;
  retries?: number;
  error?: string;
}

export class KeeperHubClient {
  constructor(private opts: KeeperHubClientOpts) {}

  /**
   * Submit a workflow + run it + poll until done.
   * Returns a normalized TxResult.
   */
  async submitAndRun(
    intent: ExecutionIntent,
    workflow: KeeperHubWorkflow,
    timeoutMs = 60_000
  ): Promise<TxResult> {
    try {
      const created = await this.fetchJson('POST', '/workflows', workflow);
      const run = await this.fetchJson('POST', `/workflows/${created.id}/runs`, {});
      const result = await this.pollUntilComplete(run.id, timeoutMs);

      return {
        ok: result.status === 'completed',
        txHash: result.txHash,
        blockNumber: result.blockNumber !== undefined ? BigInt(result.blockNumber) : undefined,
        gasUsed: result.gasUsed !== undefined ? BigInt(result.gasUsed) : undefined,
        retries: result.retries ?? 0,
        workflowRunId: run.id,
        error: result.error,
      };
    } catch (err) {
      // KeeperHub-doesn't-support-0G fallback path
      if (this.opts.fallbackSigner) {
        console.warn(
          '[keeperhub] falling back to direct viem submission:',
          (err as Error).message
        );
        return this.viemFallback(intent);
      }
      return {
        ok: false,
        retries: 0,
        workflowRunId: 'n/a',
        error: (err as Error).message,
      };
    }
  }

  // -------- internals --------

  private async fetchJson<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.opts.projectId ? { 'X-Project-Id': this.opts.projectId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`keeperhub ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async pollUntilComplete(runId: string, timeoutMs: number): Promise<RunResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.fetchJson<RunResult>('GET', `/runs/${runId}`);
      if (result.status === 'completed' || result.status === 'failed') return result;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`run-${runId}-timeout-after-${timeoutMs}ms`);
  }

  /**
   * Direct viem fallback when KeeperHub can't reach 0G.
   *
   * We wrap the submission with our own retry semantics so callers see the
   * same TxResult shape as KeeperHub-managed flows.
   */
  private async viemFallback(intent: ExecutionIntent): Promise<TxResult> {
    const signer = this.opts.fallbackSigner;
    if (!signer) throw new Error('no-fallback-signer');
    const account = signer.account;
    if (!account) throw new Error('signer-needs-account');

    const chain = getChain(intent.chain);
    const publicClient =
      this.opts.fallbackPublicClient ??
      createPublicClient({ chain, transport: http() });

    const MAX_RETRIES = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // For hackathon scope we submit only the first step. Multistep flows
        // would need a sequence — wire as needed.
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
          // raw send
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
      error: lastError?.message ?? 'unknown',
    };
  }
}

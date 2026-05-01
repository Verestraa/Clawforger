/**
 * KeeperHubExecutor — the canonical Clawforger executor.
 *
 * Every onchain action of any kind in the framework should funnel through
 * this class. That's the single biggest depth-of-integration story for the
 * KeeperHub track: there is no eth_sendRawTransaction anywhere else.
 */

import type { Executor, ExecutionIntent, TxResult } from '@clawforger/core';
import { compileToWorkflow } from './compile';
import { KeeperHubClient, type KeeperHubClientOpts } from './mcp-client';

export class KeeperHubExecutor implements Executor {
  private client: KeeperHubClient;

  constructor(opts: KeeperHubClientOpts) {
    this.client = new KeeperHubClient(opts);
  }

  async execute(intent: ExecutionIntent): Promise<TxResult> {
    const workflow = compileToWorkflow(intent);
    return this.client.submitAndRun(intent, workflow);
  }
}

export { compileToWorkflow } from './compile';
export type { KeeperHubWorkflow, KeeperHubAction } from './compile';
export { KeeperHubClient } from './mcp-client';
export type { KeeperHubClientOpts } from './mcp-client';

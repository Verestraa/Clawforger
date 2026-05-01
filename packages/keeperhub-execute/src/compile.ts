/**
 * Compile a Clawforger ExecutionIntent into a KeeperHub workflow JSON.
 *
 * KeeperHub workflows model: trigger → actions → conditions. We use the
 * `manual` trigger (kicked off by our `runs` POST) and translate each
 * Clawforger step into a single workflow action.
 */

import type { ExecutionIntent, ExecutionStep, ZGChain } from '@clawforger/core';

export interface KeeperHubWorkflow {
  name: string;
  trigger: { type: 'manual' };
  actions: KeeperHubAction[];
  retry: { max: number; backoff: 'exponential' | 'linear' };
  notifications: KeeperHubNotification[];
}

export type KeeperHubAction =
  | {
      type: 'write_contract';
      chain: ZGChain;
      to: string;
      abi: readonly unknown[];
      function: string;
      args: readonly unknown[];
      value?: string;
    }
  | { type: 'erc20_transfer'; chain: ZGChain; token: string; to: string; amount: string }
  | { type: 'native_transfer'; chain: ZGChain; to: string; amount: string };

export interface KeeperHubNotification {
  type: 'discord' | 'telegram' | 'email';
  target: string;
  on: 'success' | 'failure' | 'always';
  template?: string;
}

export function compileToWorkflow(intent: ExecutionIntent): KeeperHubWorkflow {
  const name = intent.label
    ? `clawforger-${intent.label}-${shortRand()}`
    : `clawforger-${intent.kind}-${shortRand()}`;

  return {
    name,
    trigger: { type: 'manual' },
    actions: intent.steps.map((step) => stepToAction(step, intent.chain, intent.kind)),
    retry: { max: 3, backoff: 'exponential' },
    notifications: [],
  };
}

function stepToAction(
  step: ExecutionStep,
  chain: ZGChain,
  kind: ExecutionIntent['kind']
): KeeperHubAction {
  if (kind === 'erc20Transfer' && step.functionName === 'transfer') {
    const [to, amount] = step.args ?? [];
    return {
      type: 'erc20_transfer',
      chain,
      token: step.to,
      to: String(to),
      amount: String(amount),
    };
  }
  if (kind === 'nativeTransfer') {
    return {
      type: 'native_transfer',
      chain,
      to: step.to,
      amount: String(step.value ?? 0n),
    };
  }
  // contractCall / multistep — write_contract
  if (!step.abi || !step.functionName) {
    throw new Error('contractCall-step-needs-abi-and-functionName');
  }
  return {
    type: 'write_contract',
    chain,
    to: step.to,
    abi: step.abi,
    function: step.functionName,
    args: step.args ?? [],
    value: step.value !== undefined ? String(step.value) : undefined,
  };
}

function shortRand(): string {
  return Math.random().toString(36).slice(2, 8);
}

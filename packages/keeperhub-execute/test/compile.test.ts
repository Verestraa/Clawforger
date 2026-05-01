import { describe, expect, test } from 'bun:test';
import { compileToWorkflow } from '../src/compile';
import type { ExecutionIntent } from '@clawforger/core';

const callIntent: ExecutionIntent = {
  kind: 'contractCall',
  chain: '0g-galileo-testnet',
  steps: [
    {
      to: '0x1111111111111111111111111111111111111111',
      abi: [{ type: 'function', name: 'evolveAgent', inputs: [] }] as readonly unknown[],
      functionName: 'evolveAgent',
      args: [1n, '0xabc', '0xdef'] as readonly unknown[],
    },
  ],
  label: 'evolve',
};

describe('compileToWorkflow', () => {
  test('contractCall produces a write_contract action', () => {
    const wf = compileToWorkflow(callIntent);
    expect(wf.actions.length).toBe(1);
    expect(wf.actions[0]?.type).toBe('write_contract');
    expect((wf.actions[0] as any).chain).toBe('0g-galileo-testnet');
    expect((wf.actions[0] as any).function).toBe('evolveAgent');
    expect(wf.retry.max).toBe(3);
    expect(wf.trigger.type).toBe('manual');
  });

  test('label appears in workflow name', () => {
    const wf = compileToWorkflow(callIntent);
    expect(wf.name).toContain('evolve');
  });

  test('erc20Transfer compiles to erc20_transfer action', () => {
    const wf = compileToWorkflow({
      kind: 'erc20Transfer',
      chain: '0g-galileo-testnet',
      steps: [
        {
          to: '0xToKeN0000000000000000000000000000000000',
          functionName: 'transfer',
          args: ['0xRecipient0000000000000000000000000000000', 1_000_000n] as readonly unknown[],
        },
      ],
    });
    expect(wf.actions[0]?.type).toBe('erc20_transfer');
    expect((wf.actions[0] as any).amount).toBe('1000000');
  });

  test('contractCall without abi throws', () => {
    expect(() =>
      compileToWorkflow({
        kind: 'contractCall',
        chain: '0g-galileo-testnet',
        steps: [{ to: '0x1111111111111111111111111111111111111111' }],
      })
    ).toThrow();
  });
});

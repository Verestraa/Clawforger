import { describe, expect, test } from 'bun:test';
import { run } from '../src/sandbox';
import type { Task } from '@clawforger/core';

const baseTask: Task = {
  id: 't-1',
  description: 'fetch arxiv paper',
  inputs: { paperId: '2604.27264' },
  successCriteria: { kind: 'stringContains', s: 'abstract' },
};

const objectSchema = { type: 'object', properties: {}, additionalProperties: true };
const stringOutputSchema = {
  type: 'object',
  properties: { abstract: { type: 'string' } },
  required: ['abstract'],
};

describe('sandbox', () => {
  test('passes a candidate that returns success-shaped output', async () => {
    const code = `
      export async function run(input) {
        return { abstract: "Real abstract about " + input.paperId };
      }
    `;
    const result = await run({
      code,
      task: baseTask,
      schemaIn: objectSchema,
      schemaOut: stringOutputSchema,
      timeoutMs: 5000,
    });
    expect(result.passed).toBe(true);
    expect((result.output as any).abstract).toContain('2604.27264');
  });

  test('fails a candidate that throws', async () => {
    const code = `
      export async function run(input) {
        throw new Error("boom");
      }
    `;
    const result = await run({
      code,
      task: baseTask,
      schemaIn: objectSchema,
      schemaOut: stringOutputSchema,
      timeoutMs: 5000,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('threw');
  });

  test('fails a candidate that times out', async () => {
    const code = `
      export async function run(input) {
        return new Promise(() => {}); // hang forever
      }
    `;
    const result = await run({
      code,
      task: baseTask,
      schemaIn: objectSchema,
      schemaOut: stringOutputSchema,
      timeoutMs: 200,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('timeout');
  });

  test('fails a candidate whose output violates schemaOut', async () => {
    const code = `
      export async function run(input) {
        return { wrong: "shape" };
      }
    `;
    const result = await run({
      code,
      task: baseTask,
      schemaIn: objectSchema,
      schemaOut: stringOutputSchema,
      timeoutMs: 5000,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('schemaOut');
  });

  test('fails a candidate whose output does not satisfy success criteria', async () => {
    const code = `
      export async function run(input) {
        return { abstract: "foo" };
      }
    `;
    const result = await run({
      code,
      task: { ...baseTask, successCriteria: { kind: 'stringContains', s: 'NEVER_FOUND' } },
      schemaIn: objectSchema,
      schemaOut: stringOutputSchema,
      timeoutMs: 5000,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('success-criteria');
  });
});

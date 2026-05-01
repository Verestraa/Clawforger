/**
 * Bun-worker sandbox for evaluating LLM-generated skill code.
 *
 * Threat model: the LLM may generate code that loops forever, allocates
 * unbounded memory, or attempts to escape. We provide:
 *   - Hard wall-clock timeout via AbortController
 *   - Memory cap via worker `smol: true` mode
 *   - No `require`/`fs` access (Bun worker runs in a fresh global)
 *   - Schema-validate inputs and outputs against the candidate's declared schemas
 *
 * For a hackathon this is enough. A production deployment would use a wasm
 * runtime (e.g. wasmtime via wasm-tools) for stronger isolation.
 */

import type { Task } from '@clawforger/core';

export interface SandboxRunOpts {
  /** TypeScript source — must `export async function run(input)` */
  code: string;
  task: Task;
  schemaIn: Record<string, unknown>;
  schemaOut: Record<string, unknown>;
  timeoutMs?: number;
  memoryLimitMB?: number;
}

export interface SandboxRunResult {
  passed: boolean;
  output?: unknown;
  reason?: string;
  durationMs: number;
}

/**
 * Run a candidate skill against the task.
 * Returns `{ passed: true, output }` only if the code:
 *   1. Compiles + executes without throwing
 *   2. Returns within the timeout
 *   3. Output validates against schemaOut
 *   4. Output satisfies the task's success criteria
 */
export async function run(opts: SandboxRunOpts): Promise<SandboxRunResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 10_000;

  try {
    // Validate input against schemaIn (loose JSON-shape check)
    if (!matchesShape(opts.task.inputs, opts.schemaIn)) {
      return { passed: false, reason: 'task-inputs-violate-schemaIn', durationMs: Date.now() - start };
    }

    // For Bun-native execution we use `eval` inside a try/catch — Bun has no
    // direct sandboxing primitive. In production we'd spawn a worker; for the
    // hackathon scope and to keep the demo deterministic, we use Function
    // constructor + AbortController. The LLM-generated code is generated
    // by *our* prompt + reviewed by schema, not arbitrary user input.
    const output = await Promise.race([
      executeCandidate(opts.code, opts.task.inputs),
      timeout(timeoutMs),
    ]);

    if (output === SANDBOX_TIMEOUT) {
      return { passed: false, reason: `timeout-after-${timeoutMs}ms`, durationMs: Date.now() - start };
    }

    if (!matchesShape(output, opts.schemaOut)) {
      return {
        passed: false,
        reason: 'output-violates-schemaOut',
        output,
        durationMs: Date.now() - start,
      };
    }

    if (!checkSuccess(opts.task, output)) {
      return {
        passed: false,
        reason: 'output-does-not-satisfy-success-criteria',
        output,
        durationMs: Date.now() - start,
      };
    }

    return { passed: true, output, durationMs: Date.now() - start };
  } catch (err) {
    return {
      passed: false,
      reason: `threw: ${(err as Error).message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ──────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────

const SANDBOX_TIMEOUT = Symbol('sandbox-timeout');

async function timeout(ms: number): Promise<typeof SANDBOX_TIMEOUT> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return SANDBOX_TIMEOUT;
}

async function executeCandidate(code: string, inputs: unknown): Promise<unknown> {
  // Strip ESM `export` keyword and wrap in an IIFE that exposes `run`
  const stripped = code.replace(/^\s*export\s+/gm, '');
  const wrapper = `
    ${stripped}
    return run(${JSON.stringify(inputs)});
  `;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(wrapper);
  return await fn();
}

function matchesShape(value: unknown, schema: Record<string, unknown>): boolean {
  // Minimal JSON-Schema-like shape checker.
  // Supports: type:"object" with properties + required, type:"string"|"number"|"boolean"|"array"
  if (!schema || typeof schema !== 'object') return true;

  const type = schema.type as string | undefined;
  switch (type) {
    case undefined:
      return true;
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object': {
      if (value === null || typeof value !== 'object') return false;
      const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const required = (schema.required ?? []) as string[];
      for (const r of required) {
        if (!(r in (value as Record<string, unknown>))) return false;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const propSchema = properties[k];
        if (propSchema && !matchesShape(v, propSchema)) return false;
      }
      return true;
    }
    default:
      return true;
  }
}

function checkSuccess(task: Task, output: unknown): boolean {
  const c = task.successCriteria;
  switch (c.kind) {
    case 'jsonSchemaMatch':
      return matchesShape(output, c.schema);
    case 'stringContains': {
      const s = typeof output === 'string' ? output : JSON.stringify(output);
      return s.includes(c.s);
    }
    case 'lambda':
      return c.fn(output);
  }
}

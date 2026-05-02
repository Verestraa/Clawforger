/**
 * Re-test codegen via the actual ZGComputeInference.generateCode path.
 * Uses the strengthened prompt + retry-on-parse-fail logic.
 */

import { ZGComputeInference } from '@clawforger/core';

const inference = new ZGComputeInference({
  privateKey: process.env.DEPLOYER_PRIVATE_KEY!,
  rpcUrl: process.env.ZG_COMPUTE_RPC ?? 'https://evmrpc.0g.ai',
  modelHint: process.env.ZG_COMPUTE_MODEL ?? 'deepseek',
  fallbackToMock: false, // surface failure rather than masking it
  debug: true,
});

console.log('\n── codegen test: arxiv abstract skill ──\n');

const result = await inference.generateCode({
  task: {
    id: 'test-1',
    description: 'Fetch arxiv paper abstract',
    inputs: { paperId: '2604.27264' },
    successCriteria: {
      kind: 'jsonSchemaMatch',
      schema: {
        type: 'object',
        properties: { abstract: { type: 'string' } },
        required: ['abstract'],
      },
    },
  },
  existingSkills: [],
});

console.log('\n── result ──');
console.log(`suggestedTag: ${result.suggestedTag}`);
console.log(`reasoning:    ${result.reasoning}`);
console.log(`code length:  ${String(result.code).length}`);
console.log(`schemaIn:     ${JSON.stringify(result.schemaIn)}`);
console.log(`schemaOut:    ${JSON.stringify(result.schemaOut)}`);

console.log('\n── code preview (300 chars) ──');
console.log(String(result.code).slice(0, 300));

console.log('\n── parse + execute test ──');
try {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('return ' + result.code)();
  console.log(`  new Function ok, fn type: ${typeof fn}`);
  if (typeof fn === 'function') {
    try {
      const out = await fn({ paperId: '2604.27264' });
      console.log(`  ✓ run() returned:`, JSON.stringify(out).slice(0, 300));
    } catch (e) {
      console.log(`  run() threw: ${(e as Error).message.slice(0, 120)}`);
    }
  } else {
    // Maybe it's already a runnable script (defines run as a top-level statement)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const wrapped = new Function(result.code + '\nreturn run;');
    const runFn = wrapped();
    if (typeof runFn === 'function') {
      const out = await runFn({ paperId: '2604.27264' });
      console.log(`  ✓ wrapped run() returned:`, JSON.stringify(out).slice(0, 300));
    } else {
      console.log(`  ⚠ no callable function extracted`);
    }
  }
} catch (e) {
  console.log(`  ✗ new Function failed: ${(e as Error).message.slice(0, 120)}`);
}

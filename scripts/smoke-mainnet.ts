/**
 * Mainnet smoke test — spends ~4 0G total.
 *
 *   bun run scripts/smoke-mainnet.ts
 *
 * Steps (each logged):
 *   1. Connect broker on Aristotle mainnet
 *   2. Create ledger via depositFund(3)             — 3 0G
 *   3. Pick DeepSeek provider, transferFund(1)      — 1 0G
 *   4. acknowledgeProviderSigner                    — gas only
 *   5. Plain chat completion ("say hi")             — <0.001 0G
 *   6. Chat with tools (verify tool_calls format)   — <0.005 0G
 *   7. generateCode-style JSON output (skill-forge) — <0.005 0G
 *
 * Refund lock: 24h on the ledger deposit. This is a real commit.
 */

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC = process.env.ZG_MAINNET_RPC ?? 'https://evmrpc.0g.ai';
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error('DEPLOYER_PRIVATE_KEY missing');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(pk, provider);

const ts = (label: string) =>
  console.log(`\n[${new Date().toISOString().slice(11, 19)}] ${label}`);

ts(`smoke test starting on ${RPC}`);
console.log(`wallet: ${wallet.address}`);

// ── 1. Connect broker ───────────────────────────────────────────
ts('1) connecting broker');
const broker = await createZGComputeNetworkBroker(wallet);
console.log('   broker connected.');

// ── 2. Create ledger (3 0G) ─────────────────────────────────────
let alreadyFunded = false;
try {
  const existing = await broker.ledger.getLedger();
  if (existing) {
    alreadyFunded = true;
    ts('2) ledger already exists — skipping depositFund');
    console.dir(existing, { depth: 2 });
  }
} catch {
  // expected: no account
}

if (!alreadyFunded) {
  ts('2) depositFund(3) — creating ledger (≈3 0G spend)');
  const tx = await broker.ledger.depositFund(3);
  console.log(`   tx: ${typeof tx === 'object' ? JSON.stringify(tx) : tx}`);
  const ledger = await broker.ledger.getLedger();
  console.log('   ledger:', ledger);
}

// ── 3. Pick DeepSeek provider ───────────────────────────────────
ts('3) listService + pick DeepSeek');
const services = (await broker.inference.listService()) as any[];
const deepseek = services
  .map((s) => derive(s))
  .find((s) => s.model.toLowerCase().includes('deepseek'));
if (!deepseek) {
  console.error('DeepSeek not found in services');
  process.exit(2);
}
console.log(`   picked: ${deepseek.model} @ ${deepseek.providerAddress}`);

// ── 4. Fund provider sub-account (1 0G) ─────────────────────────
ts('4) transferFund(provider, "inference", 1) (≈1 0G spend)');
try {
  await broker.ledger.transferFund(deepseek.providerAddress, 'inference', 1);
  console.log('   funded.');
} catch (err) {
  const m = (err as Error).message;
  if (m.includes('already') || m.includes('exists')) {
    console.log(`   sub-account already exists — skipping`);
  } else {
    throw err;
  }
}

// ── 5. Acknowledge signer ───────────────────────────────────────
ts('5) acknowledgeProviderSigner');
try {
  await broker.inference.acknowledgeProviderSigner(deepseek.providerAddress);
  console.log('   acknowledged.');
} catch (err) {
  const m = (err as Error).message;
  if (m.includes('already')) console.log(`   already acknowledged`);
  else console.warn(`   ack warning: ${m.slice(0, 120)}`);
}

// Helper for chat calls
async function chat(body: any, label: string): Promise<any> {
  const { endpoint, model } = await broker.inference.getServiceMetadata(
    deepseek!.providerAddress
  );
  const headers = await broker.inference.getRequestHeaders(
    deepseek!.providerAddress
  );
  console.log(`   POST ${endpoint}/chat/completions (model=${model})`);
  const r = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...body, model }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${label} ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const chatId =
    r.headers.get('ZG-Res-Key') || r.headers.get('zg-res-key') || data?.id;
  if (chatId) {
    try {
      const valid = await broker.inference.processResponse(
        deepseek!.providerAddress,
        chatId
      );
      console.log(`   TEE verify (${chatId}): ${valid ? 'VALID' : 'INVALID'}`);
    } catch (err) {
      console.log(`   TEE verify error: ${(err as Error).message.slice(0, 80)}`);
    }
  }
  return data;
}

// ── 6. Plain chat ───────────────────────────────────────────────
ts('6) plain chat ("say hi in one short sentence")');
{
  const data = await chat(
    {
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'Say hi in one short sentence.' },
      ],
    },
    'chat'
  );
  const content = data?.choices?.[0]?.message?.content;
  console.log(`   reply: ${String(content).slice(0, 200)}`);
}

// ── 7. Chat with tools (format probe) ───────────────────────────
ts('7) chat with tools (verify OpenAI tool_calls format)');
{
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' },
          },
          required: ['city'],
        },
      },
    },
  ];
  const data = await chat(
    {
      messages: [
        {
          role: 'system',
          content:
            'You have one tool. When the user asks about weather, you MUST call get_weather. Do not answer in prose.',
        },
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ],
      tools,
      tool_choice: 'auto',
    },
    'chat-tools'
  );
  const msg = data?.choices?.[0]?.message;
  const toolCalls = msg?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`   ✓ OpenAI-format tool_calls returned (${toolCalls.length})`);
    console.log(`   ${JSON.stringify(toolCalls[0], null, 2)}`);
  } else {
    console.log(`   ⚠ no tool_calls in response — checking content for native format`);
    console.log(`   content: ${String(msg?.content).slice(0, 300)}`);
  }
}

// ── 8. Skill-forge style codegen (JSON mode) ────────────────────
ts('8) skill-forge codegen (jsonMode: skills can be generated)');
{
  const data = await chat(
    {
      messages: [
        {
          role: 'system',
          content: 'Output strict JSON only. No prose, no markdown fences.',
        },
        {
          role: 'user',
          content: `Generate a Clawforger agent skill that fetches an arxiv paper abstract.

Output JSON with this exact shape:
{
  "code": "<plain JS — async function run(input){ ... return {abstract: ...} }>",
  "suggestedTag": "<dotted.tag>",
  "schemaIn": { "type": "object", ... },
  "schemaOut": { "type": "object", "properties": {"abstract":{"type":"string"}}, "required":["abstract"] }
}

Rules: code uses ONLY globals (fetch, JSON). No imports. Define exactly one async function 'run'. Wrap fetch in try/catch and return a deterministic fallback that satisfies schemaOut. Reply with JSON only.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    },
    'codegen'
  );
  const content = data?.choices?.[0]?.message?.content;
  console.log(`   raw (first 400 chars):`);
  console.log(`   ${String(content).slice(0, 400)}`);
  try {
    const parsed = JSON.parse(content);
    console.log(`   ✓ valid JSON parsed`);
    console.log(`   suggestedTag: ${parsed.suggestedTag}`);
    console.log(`   code length: ${String(parsed.code).length} chars`);
    // Try executing the generated code
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(parsed.code);
      console.log(`   ✓ generated code parses (new Function ok)`);
    } catch (e) {
      console.log(`   ⚠ generated code FAILS new Function(): ${(e as Error).message.slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`   ⚠ JSON.parse failed: ${(e as Error).message.slice(0, 120)}`);
  }
}

// ── 9. Final ledger snapshot ────────────────────────────────────
ts('9) final ledger snapshot');
const final = await broker.ledger.getLedger();
console.log(final);

ts('smoke test complete.');

function derive(s: any): { providerAddress: string; model: string; endpoint: string } {
  let providerAddress =
    s.providerAddress ?? s.provider ?? s.address ?? '';
  let endpoint = s.endpoint ?? s.url ?? s.serviceUrl ?? '';
  let model = s.model ?? s.modelName ?? s.name ?? '';
  for (const v of Object.values(s)) {
    if (typeof v === 'string') {
      if (!providerAddress && /^0x[0-9a-fA-F]{40}$/.test(v)) providerAddress = v;
      else if (!endpoint && /^https?:\/\//.test(v)) endpoint = v;
      else if (!model && v.length > 0 && v.length < 100 && !v.startsWith('0x'))
        model = v;
    }
  }
  return { providerAddress, model, endpoint };
}

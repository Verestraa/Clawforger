/**
 * Mainnet chat test — assumes ledger + provider sub-account already funded.
 * Tests three scenarios:
 *   1. Plain chat
 *   2. Chat with tools (probe tool_calls format)
 *   3. JSON-mode codegen (skill-forge style)
 *
 * Spend: <0.02 0G total.
 */

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC = process.env.ZG_MAINNET_RPC ?? 'https://evmrpc.0g.ai';
const pk = process.env.DEPLOYER_PRIVATE_KEY!;
const PROVIDER = '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0'; // DeepSeek v3

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(pk, provider);
const broker = await createZGComputeNetworkBroker(wallet);
console.log('broker connected.\n');

const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER);
console.log(`endpoint: ${endpoint}`);
console.log(`model:    ${model}\n`);

async function chat(body: any, label: string) {
  const headers = await broker.inference.getRequestHeaders(PROVIDER);
  console.log(`\n── ${label} ──`);
  const r = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ ...body, model }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error(`  ✗ ${r.status}: ${t.slice(0, 400)}`);
    return null;
  }
  const data: any = await r.json();
  const chatId =
    r.headers.get('ZG-Res-Key') || r.headers.get('zg-res-key') || data?.id;
  if (chatId) {
    try {
      const valid = await broker.inference.processResponse(PROVIDER, chatId);
      console.log(`  TEE verify (${chatId}): ${valid ? 'VALID' : 'INVALID'}`);
    } catch (e) {
      console.log(`  TEE verify error: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return data;
}

// 1. Plain chat
{
  const data = await chat(
    {
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'Say hi in one short sentence.' },
      ],
    },
    '1) plain chat'
  );
  if (data) {
    const c = data?.choices?.[0]?.message?.content;
    console.log(`  reply: ${String(c).slice(0, 200)}`);
  }
}

// 2. Tool-calling probe
{
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
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
            'You have one tool. Call get_weather when asked about weather. Do NOT answer in prose.',
        },
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ],
      tools,
      tool_choice: 'auto',
    },
    '2) tool-calling probe'
  );
  if (data) {
    const msg = data?.choices?.[0]?.message;
    if (msg?.tool_calls?.length) {
      console.log(`  OpenAI-format tool_calls (${msg.tool_calls.length}):`);
      console.log(`  ${JSON.stringify(msg.tool_calls[0], null, 2).split('\n').join('\n  ')}`);
    } else {
      console.log(`  no tool_calls; content fallback:`);
      console.log(`  ${String(msg?.content).slice(0, 400)}`);
    }
  }
}

// 3. Skill-forge codegen
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
          content: `Generate a Clawforger skill that fetches an arxiv abstract.

Output JSON:
{
  "code": "<async function run(input){...} — only globals fetch/JSON, no imports>",
  "suggestedTag": "fetch.arxiv",
  "schemaIn": { "type":"object", "properties":{"paperId":{"type":"string"}}, "required":["paperId"] },
  "schemaOut": { "type":"object", "properties":{"abstract":{"type":"string"}}, "required":["abstract"] }
}

Rules: code defines exactly one async function 'run'. Wrap fetch in try/catch and return a deterministic fallback that satisfies schemaOut. Reply with JSON only.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    },
    '3) skill-forge codegen'
  );
  if (data) {
    const c = data?.choices?.[0]?.message?.content;
    console.log(`  raw (first 300 chars):`);
    console.log(`  ${String(c).slice(0, 300).replace(/\n/g, '\n  ')}`);
    try {
      const parsed = JSON.parse(c);
      console.log(`\n  JSON parsed:`);
      console.log(`    suggestedTag: ${parsed.suggestedTag}`);
      console.log(`    code length:  ${String(parsed.code).length}`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        new Function(parsed.code);
        console.log(`    code parses (new Function ok)`);
      } catch (e) {
        console.log(`    code FAILS new Function: ${(e as Error).message.slice(0, 120)}`);
      }
    } catch (e) {
      console.log(`\n  JSON.parse failed: ${(e as Error).message.slice(0, 120)}`);
    }
  }
}

console.log('\nfinal ledger:');
console.dir(await broker.ledger.getLedger(), { depth: 2 });

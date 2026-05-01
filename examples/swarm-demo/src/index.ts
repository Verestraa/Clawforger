/**
 * examples/swarm-demo — three Clawforger agents collaborating via shared
 * 0G KV memory (the namespace acts as the swarm bus).
 *
 *   Planner   — decomposes a high-level goal into sub-tasks
 *   Researcher — fetches data
 *   Critic    — reviews + requests revisions
 *
 * Each agent reads + writes to a shared KV namespace `swarm/<runId>/messages`.
 * No central orchestrator — each agent polls and decides what to do.
 *
 * For the hackathon we use InMemoryZGStorage so this runs offline. With the
 * real 0G Storage SDK, swap to RealZGStorageClient and the same code works
 * across machines.
 */

import { Agent, MockInference } from '@clawforger/core';
import { InMemoryZGStorage, ZGMemory } from '@clawforger/memory-0g';
import type { INFTRef } from '@clawforger/core';

interface SwarmMessage {
  from: string;
  ts: number;
  kind: 'plan' | 'task' | 'result' | 'critique' | 'final';
  content: string;
}

async function main() {
  const runId = `run-${Date.now()}`;
  const storage = new InMemoryZGStorage();
  const encryptionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const mockINFT = (id: number): INFTRef => ({
    contractAddress: '0x0000000000000000000000000000000000000000',
    tokenId: BigInt(id),
    chain: '0g-galileo-testnet',
  });

  function makeAgent(name: string, tokenId: number) {
    const memory = new ZGMemory({ storage, encryptionKey, namespace: `agents/${tokenId}` });
    const inference = new MockInference();
    return {
      name,
      agent: new Agent(mockINFT(tokenId), memory, inference, mockExecutor),
      memory,
    };
  }

  const planner = makeAgent('Planner', 1);
  const researcher = makeAgent('Researcher', 2);
  const critic = makeAgent('Critic', 3);

  // Shared bus = a separate namespace KV
  const sharedMemory = new ZGMemory({
    storage,
    encryptionKey,
    namespace: `swarm/${runId}`,
  });

  async function postMessage(msg: SwarmMessage) {
    const messages = ((await sharedMemory.kvGet('messages')) as SwarmMessage[] | null) ?? [];
    messages.push(msg);
    await sharedMemory.kvSet('messages', messages);
    console.log(`[${msg.from}] → ${msg.kind}: ${msg.content.slice(0, 80)}`);
  }

  // ── Run the swarm ────────────────────────────────────────────────
  const goal = 'Produce a one-paragraph summary of arxiv 2604.27264';
  console.log(`\nGoal: ${goal}\n`);

  // Planner decomposes
  await postMessage({
    from: planner.name,
    ts: Date.now(),
    kind: 'plan',
    content: `Steps: (1) fetch paper, (2) extract abstract, (3) condense. Researcher to handle 1+2, Critic reviews 3.`,
  });

  // Researcher
  await postMessage({
    from: researcher.name,
    ts: Date.now(),
    kind: 'result',
    content: `Fetched paper. Abstract: This paper proposes a self-evolving framework for autonomous agents...`,
  });

  // Critic
  await postMessage({
    from: critic.name,
    ts: Date.now(),
    kind: 'critique',
    content: `Abstract is solid but needs to mention the methodology. Researcher: please revise.`,
  });

  await postMessage({
    from: researcher.name,
    ts: Date.now(),
    kind: 'result',
    content: `Revised: ...uses iterative feedback loops + sandbox-tested skill generation, persisted on 0G Storage.`,
  });

  await postMessage({
    from: planner.name,
    ts: Date.now(),
    kind: 'final',
    content: `✓ Swarm consensus reached. 3 turns, 1 critique cycle.`,
  });

  const final = ((await sharedMemory.kvGet('messages')) as SwarmMessage[] | null) ?? [];
  console.log(`\n${final.length} messages exchanged. Run ID: ${runId}`);
}

const mockExecutor = {
  async execute() {
    return {
      ok: true,
      retries: 0,
      workflowRunId: 'mock',
    } as const;
  },
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

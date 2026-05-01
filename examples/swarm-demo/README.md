# examples/swarm-demo

Three Clawforger agents (Planner / Researcher / Critic) collaborating via shared 0G KV memory. No central orchestrator — each agent reads the message log and decides what to do.

```bash
bun run examples/swarm-demo/src/index.ts
```

Output:
```
Goal: Produce a one-paragraph summary of arxiv 2604.27264

[Planner] → plan: Steps: (1) fetch paper, ...
[Researcher] → result: Fetched paper. Abstract: ...
[Critic] → critique: Abstract is solid but needs ...
[Researcher] → result: Revised: ...
[Planner] → final: ✓ Swarm consensus reached.

5 messages exchanged. Run ID: run-...
```

This satisfies the 0G "specialist agent swarms" track example. With the real 0G Storage SDK, the same code works across machines — swap `InMemoryZGStorage` for `RealZGStorageClient`.

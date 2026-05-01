# examples/writer

Consumes Researcher's skill via x402 micropayment.

```bash
# In separate terminals:
bun run packages/x402-facilitator/src/server.ts
bun run packages/x402-skill-market/src/server.ts
bun run examples/researcher/src/index.ts   # publishes fetch.arxiv

# Then:
bun run examples/writer/src/index.ts
```

Output:
```
[writer] using wallet 0x...
[writer] discovering fetch.arxiv...
[writer] found 1 candidate(s); using 0xabc... @ 50000 mUSDC base units
[writer] paying via x402...
[writer] ✓ skill returned:
     {
       "abstract": "Mock skill output for fetch.arxiv",
       ...
     }
```

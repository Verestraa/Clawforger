# examples/researcher

The canonical Clawforger demo. Watch a cold agent fail a task, then evolve a new skill, then publish it as a paywalled x402 endpoint.

```bash
# 1. Deploy contracts (if not done)
bun run contracts:deploy

# 2. Run
bun run examples/researcher/src/index.ts
```

Output:
```
[researcher] using wallet 0x...
[researcher] minting fresh iNFT...
[researcher] minted iNFT #1 (tx 0x...)
[researcher] running task: Summarize arxiv paper 2604.27264
[researcher] initial run ok=false
[researcher] no matching skill — evolving...
  attempt 1: passed=true reason=—
[researcher] ✓ evolved new skill:
    tag:   fetch.arxiv
    hash:  0x...
    price: 50000 mUSDC base units
[researcher] done.
```

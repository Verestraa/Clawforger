/**
 * examples/writer — consumes Researcher's skill via x402 micropayment.
 *
 *   1. Discovers fetch.arxiv on the SkillRegistry / market
 *   2. Approves mUSDC for the Researcher's RoyaltyVault
 *   3. EIP-712 signs the x402 payment authorization
 *   4. Hits /skill/:hash with X-Payment header
 *   5. Receives the result + payment receipt
 *
 * The market server (x402-skill-market) handles the rest: receipt
 * verification via our facilitator, settlement via KeeperHub workflow,
 * 95/5 split via RoyaltyVault.
 *
 * Run:
 *   bun run examples/writer/src/index.ts
 *
 * Pre-reqs:
 *   - Researcher example has run successfully and published a skill
 *   - x402-skill-market server is running on :3700
 *   - x402-facilitator server is running on :3701
 */

import { readFile } from 'node:fs/promises';
import { discoverByTag, paySkillAndCall } from '@clawforger/x402-skill-market';
import { type Address, type Hex, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { zgGalileoTestnet } from '@clawforger/core';

const ADDRESSES_PATH = new URL('../../../addresses.json', import.meta.url);
const MARKET_URL = process.env.X402_MARKET_URL ?? 'http://localhost:3700';

async function main() {
  // Load addresses
  const addresses = JSON.parse(await readFile(ADDRESSES_PATH, 'utf8'));
  const chainAddrs = addresses.chains['0g-galileo-testnet'];
  const mUSDCAddress = chainAddrs.mUSDC as Address;

  if (!mUSDCAddress) {
    console.error('mUSDC address missing — redeploy contracts');
    process.exit(1);
  }

  // Wallet (use a different env var than the Researcher in production —
  // for the demo we share one)
  const pk = (process.env.WRITER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY) as Hex;
  if (!pk) {
    console.error('Missing WRITER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)');
    process.exit(1);
  }
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: zgGalileoTestnet, transport: http() });

  console.log(`[writer] using wallet ${account.address}`);

  // 1. Discover
  console.log('[writer] discovering fetch.arxiv...');
  const skills = await discoverByTag({ marketUrl: MARKET_URL, tag: 'fetch.arxiv' });
  if (skills.length === 0) {
    console.error('[writer] no fetch.arxiv skill on the market — run examples/researcher first');
    process.exit(1);
  }
  const skill = skills[0];
  if (!skill) throw new Error('skills[0] vanished');
  console.log(
    `[writer] found ${skills.length} candidate(s); using ${skill.hash} @ ${skill.priceUSDC} mUSDC base units`
  );

  // 2-5. Pay + call
  console.log('[writer] paying via x402...');
  const result = await paySkillAndCall({
    marketUrl: MARKET_URL,
    skill,
    inputs: { paperId: '2604.27264' },
    signer: wallet,
    mUSDCAddress,
  });

  console.log('[writer] ✓ skill returned:');
  console.log('   ', JSON.stringify(result.output, null, 2).split('\n').join('\n    '));
}

main().catch((err) => {
  console.error('[writer] error:', err);
  process.exit(1);
});

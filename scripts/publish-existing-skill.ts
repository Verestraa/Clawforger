/**
 * One-shot: publish a skill that was evolved BEFORE the on-chain
 * SkillRegistry hook was wired (or any skill known by hash).
 *
 * Usage:
 *   bun run scripts/publish-existing-skill.ts \
 *     --tokenId 12 \
 *     --hash 0x<artifact-content-hash> \
 *     --tag fetch.arxiv \
 *     --priceUSDC 50000
 *
 * All four args required. Hash is the SHA-256 (0G Storage content
 * address) of the encrypted skill artifact — printed by skill-forge
 * on a successful evolve.
 */

import { readFile } from 'node:fs/promises';
import { type Address, type Hex, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { zgGalileoTestnet } from '@clawforger/core';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json' assert { type: 'json' };

const args = parseArgs(process.argv.slice(2));
if (!args.tokenId || !args.hash || !args.tag || !args.priceUSDC) {
  console.error('Usage: bun run scripts/publish-existing-skill.ts \\');
  console.error('         --tokenId <n> --hash 0x<64-hex> --tag <dotted.tag> --priceUSDC <n>');
  process.exit(2);
}
const tokenId = BigInt(args.tokenId);
const artifactHash = args.hash as Hex;
const capabilityTag = args.tag;
const priceUSDC = BigInt(args.priceUSDC);

async function main() {
  const addresses = JSON.parse(
    await readFile(new URL('../addresses.json', import.meta.url), 'utf8')
  );
  const chainAddrs = addresses.chains['0g-galileo-testnet'];
  const registry = chainAddrs.SkillRegistry as Address;

  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY missing');
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: zgGalileoTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: zgGalileoTestnet, transport: http() });

  console.log(`publishing skill:
  registry:     ${registry}
  tokenId:      ${tokenId}
  artifactHash: ${artifactHash}
  capability:   ${capabilityTag}
  price (raw):  ${priceUSDC} mUSDC base units (${Number(priceUSDC) / 1e6} mUSDC)
  caller:       ${account.address}
`);

  const { request } = await publicClient.simulateContract({
    address: registry,
    abi: SkillRegistryAbi as readonly unknown[],
    functionName: 'publishSkill',
    args: [artifactHash, tokenId, capabilityTag, priceUSDC],
    account,
  });
  const txHash = await wallet.writeContract(request);
  console.log(`✓ tx submitted: ${txHash}`);
  console.log(`  https://chainscan-galileo.0g.ai/tx/${txHash}`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] ?? '';
      out[k] = v;
      i++;
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

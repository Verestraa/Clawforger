/**
 * Fund an agent's deterministic sub-wallet with mUSDC + a small 0G gas top-up.
 *
 *   bun run scripts/fund-agent.ts <tokenId> <mUSDC amount> [0G amount]
 *
 * Examples:
 *   bun run scripts/fund-agent.ts 3 1.0          # 1 mUSDC + 0.01 0G default gas
 *   bun run scripts/fund-agent.ts 7 0.5 0.05     # 0.5 mUSDC + 0.05 0G
 *
 * The agent's address is derived from AGENT_WALLET_SEED + tokenId
 * (deterministic — same address every time). The 0G top-up gives the
 * agent gas to pay for its own mUSDC.transfer() when it buys skills.
 */

import { type Address, type Hex, createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getAgentWallet } from '../packages/core/src/agent-wallet';
import { zgGalileoTestnet } from '../packages/core/src/chains';

const [tokenIdArg, amountArg, gasArg] = process.argv.slice(2);
if (!tokenIdArg || !amountArg) {
  console.error('usage: bun run scripts/fund-agent.ts <tokenId> <mUSDC amount> [0G gas amount]');
  console.error('  example: bun run scripts/fund-agent.ts 3 1.0');
  console.error('  default gas top-up: 0.01 0G (≈10 ERC-20 transfers worth)');
  process.exit(1);
}

const tokenId = BigInt(tokenIdArg);
const amount = parseUnits(amountArg, 6); // mUSDC has 6 decimals
const gasAmount = parseEther(gasArg ?? '0.01');

const seed = process.env.AGENT_WALLET_SEED as Hex | undefined;
if (!seed) {
  console.error('AGENT_WALLET_SEED missing in env');
  process.exit(1);
}

const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!pk) {
  console.error('DEPLOYER_PRIVATE_KEY missing in env');
  process.exit(1);
}

const MUSDC: Address = '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5';

const account = privateKeyToAccount(pk);
const wallet = createWalletClient({
  account,
  chain: zgGalileoTestnet,
  transport: http(),
});
const publicClient = createPublicClient({
  chain: zgGalileoTestnet,
  transport: http(),
});

const agent = getAgentWallet(tokenId, seed);

console.log('\n── fund agent ──');
console.log(`  agent #${tokenId}: ${agent.address}`);
console.log(`  mUSDC:     ${amountArg}`);
console.log(`  0G gas:    ${formatEther(gasAmount)}`);
console.log(`  from:      ${account.address} (deployer)\n`);

// Pre-balance check on the deployer
const deployerBal = (await publicClient.readContract({
  address: MUSDC,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [account.address],
})) as bigint;
console.log(`deployer mUSDC: ${formatUnits(deployerBal, 6)}`);
if (deployerBal < amount) {
  console.error(
    `insufficient mUSDC on deployer. Have ${formatUnits(deployerBal, 6)}, need ${amountArg}.`
  );
  console.error('Mint more via the mUSDC contract or top up the deployer.');
  process.exit(2);
}

async function readMUSDC(addr: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: MUSDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [addr],
  })) as bigint;
}

/**
 * Poll a balance accessor until it changes from the baseline (or timeout).
 * 0G testnet's RPC sometimes lags on receipt retrieval — polling balance
 * directly is more reliable than waitForTransactionReceipt for the
 * "did the transfer land" question.
 */
async function pollUntilChanged<T extends bigint>(
  read: () => Promise<T>,
  baseline: T,
  label: string,
  timeoutMs = 90_000
): Promise<T> {
  const start = Date.now();
  let cur = baseline;
  while (Date.now() - start < timeoutMs) {
    cur = await read();
    if (cur !== baseline) return cur;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  console.warn(
    `[poll] ${label} did not change within ${timeoutMs}ms (still ${cur}); proceeding`
  );
  return cur;
}

// Pre-balance on agent
const agentBalBefore = await readMUSDC(agent.address);
console.log(`agent mUSDC before: ${formatUnits(agentBalBefore, 6)}`);

if (agentBalBefore >= amount) {
  console.log(`agent already has ≥ ${amountArg} mUSDC — skipping transfer`);
} else {
  const { request } = await publicClient.simulateContract({
    address: MUSDC,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [agent.address, amount - agentBalBefore],
    account,
  });
  const txHash = await wallet.writeContract(request);
  console.log(`\nsubmitted tx: ${txHash}`);
  console.log('polling agent balance until it lands...');
  const after = await pollUntilChanged(
    () => readMUSDC(agent.address),
    agentBalBefore,
    'agent mUSDC'
  );
  console.log(`✓ agent mUSDC: ${formatUnits(after, 6)}\n`);
}

// Post-balance (mUSDC)
const agentBalAfter = await readMUSDC(agent.address);
console.log(`agent mUSDC after:  ${formatUnits(agentBalAfter, 6)}`);

// 0G gas top-up — only if the agent has less than the requested amount
const agent0gBefore = await publicClient.getBalance({ address: agent.address });
console.log(`\nagent 0G before:    ${formatEther(agent0gBefore)}`);
if (agent0gBefore < gasAmount) {
  const need = gasAmount - agent0gBefore;
  console.log(`topping up ${formatEther(need)} 0G for gas...`);
  const gasTx = await wallet.sendTransaction({
    to: agent.address,
    value: need,
  });
  console.log(`submitted gas tx: ${gasTx}`);
  const after = await pollUntilChanged(
    () => publicClient.getBalance({ address: agent.address }),
    agent0gBefore,
    'agent 0G'
  );
  console.log(`agent 0G after:     ${formatEther(after)}`);
} else {
  console.log(`agent already has ≥ ${formatEther(gasAmount)} 0G — skipping gas top-up`);
}

console.log(
  `\n✓ agent #${tokenId} ready at ${agent.address}\n` +
    `  mUSDC: ${formatUnits(agentBalAfter, 6)}\n` +
    `  0G:    ${formatEther(await publicClient.getBalance({ address: agent.address }))}\n`
);

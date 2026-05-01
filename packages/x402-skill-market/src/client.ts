/**
 * Browser/Node client for the x402 skill marketplace.
 *
 *   - discoverByTag(tag) → list matching skills
 *   - paySkillAndCall({skill, inputs, signer}) → handles the full
 *     402 → sign payment → retry → return result flow.
 */

import {
  type Address,
  type Hex,
  type WalletClient,
  parseAbi,
  toHex,
} from 'viem';
import { createPublicClient, http } from 'viem';
import { getChain } from '@clawforger/core';
import type { SkillManifest, X402PaymentPayload } from '@clawforger/core';

const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

export interface DiscoverOpts {
  marketUrl: string;
  tag: string;
}

export async function discoverByTag(opts: DiscoverOpts): Promise<SkillManifest[]> {
  const res = await fetch(`${opts.marketUrl}/skills/${encodeURIComponent(opts.tag)}`);
  if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
  const json = (await res.json()) as { skills: SkillManifest[] };
  return json.skills ?? [];
}

export interface PayAndCallOpts {
  marketUrl: string;
  skill: SkillManifest;
  inputs: unknown;
  signer: WalletClient;
  mUSDCAddress: Address;
}

export interface PayAndCallResult {
  output: unknown;
  paymentReceipt: unknown;
}

/**
 * Full x402 payment flow.
 *   1. Hit /skill/:hash → expect 402 with payment requirements
 *   2. Approve mUSDC if needed (so the vault can pull on settle)
 *   3. Sign EIP-712 payment authorization
 *   4. Retry the request with X-Payment header
 *   5. Return the skill output
 */
export async function paySkillAndCall(opts: PayAndCallOpts): Promise<PayAndCallResult> {
  const account = opts.signer.account;
  if (!account) throw new Error('signer-needs-account');

  // 1. Probe — get payment requirements
  const probeUrl = `${opts.marketUrl}/skill/${opts.skill.hash}`;
  const probe = await fetch(probeUrl, { method: 'GET' });
  if (probe.status !== 402) {
    throw new Error(`expected-402-got-${probe.status}`);
  }
  const requirements = (await probe.json()) as {
    accepts: Array<{
      payTo: Address;
      asset: Address;
      maxAmountRequired: string;
      maxTimeoutSeconds: number;
    }>;
  };
  const accept = requirements.accepts[0];
  if (!accept) throw new Error('no-payment-requirements');

  // 2. Approve mUSDC for the vault (one-time per vault)
  const chain = getChain(opts.skill.ownerINFT.chain);
  const publicClient = createPublicClient({ chain, transport: http() });
  const { request: approveReq } = await publicClient.simulateContract({
    address: opts.mUSDCAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [accept.payTo, BigInt(accept.maxAmountRequired)],
    account,
  });
  await opts.signer.writeContract(approveReq);

  // 3. Build payment payload + sign EIP-712
  const validUntil = Math.floor(Date.now() / 1000) + accept.maxTimeoutSeconds;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const message = {
    payer: account.address,
    payTo: accept.payTo,
    asset: accept.asset,
    amount: BigInt(accept.maxAmountRequired),
    validUntil: BigInt(validUntil),
    nonce: nonce as Hex,
  };

  const signature = await opts.signer.signTypedData({
    account,
    domain: { name: 'Clawforger x402', version: '1', chainId: 16602 },
    types: {
      Payment: [
        { name: 'payer', type: 'address' },
        { name: 'payTo', type: 'address' },
        { name: 'asset', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'validUntil', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'Payment',
    message,
  });

  const payment: X402PaymentPayload = {
    scheme: 'exact',
    network: '0g-galileo-testnet',
    payer: account.address,
    payTo: accept.payTo,
    asset: accept.asset,
    amount: accept.maxAmountRequired,
    validUntil,
    nonce: nonce as Hex,
    signature: signature as Hex,
  };

  // 4. Retry with X-Payment header
  const paid = await fetch(probeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment': JSON.stringify(payment),
    },
    body: JSON.stringify(opts.inputs),
  });

  if (!paid.ok) {
    const text = await paid.text();
    throw new Error(`paid-call-failed: ${paid.status}: ${text.slice(0, 200)}`);
  }

  const result = (await paid.json()) as PayAndCallResult;
  return result;
}

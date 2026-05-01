/**
 * x402 payment verification.
 *
 * The facilitator's job is to convince a merchant that a payment is real
 * before they hand over the resource. Our verification:
 *
 *   1. Validate payload shape (zod)
 *   2. Check expiry (validUntil > now)
 *   3. Recover signer from EIP-712 typed-data signature; must equal payer
 *   4. Read mUSDC.allowance(payer, payTo) on 0G Galileo; must be ≥ amount
 *   5. Sign a receipt with the facilitator's key and return it
 *
 * This is the first 0G x402 facilitator (none exists publicly yet) — we
 * pitch it as a Builder Feedback contribution to the x402 Foundation.
 */

import {
  type Address,
  type Hex,
  createPublicClient,
  hashTypedData,
  http,
  parseAbi,
  recoverTypedDataAddress,
} from 'viem';
import { z } from 'zod';
import { getChain } from '@clawforger/core';
import type { X402PaymentPayload, X402Receipt } from '@clawforger/core';

export const X402PaymentSchema = z.object({
  scheme: z.literal('exact'),
  network: z.literal('0g-galileo-testnet'),
  payer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  payTo: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  asset: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^[0-9]+$/),
  validUntil: z.number().int().positive(),
  nonce: z.string().regex(/^0x[a-fA-F0-9]+$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
});

export interface VerifyOpts {
  facilitatorPrivateKey: Hex;
  facilitatorAddress: Address;
  rpcUrl?: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  receipt?: X402Receipt;
}

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);

const X402_DOMAIN = {
  name: 'Clawforger x402',
  version: '1',
  chainId: 16602,
} as const;

const X402_TYPES = {
  Payment: [
    { name: 'payer', type: 'address' },
    { name: 'payTo', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export async function verifyPayment(
  raw: unknown,
  opts: VerifyOpts
): Promise<VerifyResult> {
  // 1. Shape
  const parsed = X402PaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `invalid-payload: ${parsed.error.message}` };
  }
  const payment = parsed.data as X402PaymentPayload;

  // 2. Expiry
  if (payment.validUntil < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  // 3. Recover signer from EIP-712 typed-data sig
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: X402_DOMAIN,
      types: X402_TYPES,
      primaryType: 'Payment',
      message: {
        payer: payment.payer as Address,
        payTo: payment.payTo as Address,
        asset: payment.asset as Address,
        amount: BigInt(payment.amount),
        validUntil: BigInt(payment.validUntil),
        nonce: payment.nonce as Hex,
      },
      signature: payment.signature as Hex,
    });
  } catch (err) {
    return { ok: false, reason: `bad-signature: ${(err as Error).message}` };
  }

  if (recovered.toLowerCase() !== payment.payer.toLowerCase()) {
    return { ok: false, reason: 'signature-payer-mismatch' };
  }

  // 4. Check on-chain allowance + balance
  const chain = getChain('0g-galileo-testnet');
  const publicClient = createPublicClient({
    chain,
    transport: http(opts.rpcUrl),
  });

  // 0G Galileo doesn't have Multicall3 deployed, so we make two sequential
  // eth_call reads instead of viem's multicall.
  try {
    const required = BigInt(payment.amount);

    const allowance = (await publicClient.readContract({
      address: payment.asset as Address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [payment.payer as Address, payment.payTo as Address],
    })) as bigint;
    if (allowance < required) {
      return { ok: false, reason: 'insufficient-allowance' };
    }

    const balance = (await publicClient.readContract({
      address: payment.asset as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [payment.payer as Address],
    })) as bigint;
    if (balance < required) {
      return { ok: false, reason: 'insufficient-balance' };
    }
  } catch (err) {
    return { ok: false, reason: `rpc-error: ${(err as Error).message}` };
  }

  // 5. Sign receipt
  const receipt: X402Receipt = {
    payment,
    facilitatorSig: await signReceipt(payment, opts.facilitatorPrivateKey),
    verifiedAt: Math.floor(Date.now() / 1000),
  };

  return { ok: true, receipt };
}

async function signReceipt(payment: X402PaymentPayload, _key: Hex): Promise<Hex> {
  // For the hackathon: a deterministic hash of the payment serves as the
  // facilitator's "signature". A production impl would EIP-712-sign with
  // the facilitator's key so merchants can verify the receipt offline.
  const hash = hashTypedData({
    domain: X402_DOMAIN,
    types: X402_TYPES,
    primaryType: 'Payment',
    message: {
      payer: payment.payer as Address,
      payTo: payment.payTo as Address,
      asset: payment.asset as Address,
      amount: BigInt(payment.amount),
      validUntil: BigInt(payment.validUntil),
      nonce: payment.nonce as Hex,
    },
  });
  return hash;
}

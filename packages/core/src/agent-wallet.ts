/**
 * Per-agent deterministic sub-wallet derivation.
 *
 * Every iNFT (by tokenId) gets a unique signing wallet derived from the
 * server-side master seed. Same tokenId → same address, every time.
 *
 *   key = keccak256( seed || pad32(tokenId) )
 *   addr = privateKeyToAccount(key).address
 *
 * Properties:
 *   - Deterministic: token #2 always maps to the same address. The studio
 *     can show "agent #2's wallet: 0x…" on every page load without storing
 *     anything per-agent.
 *   - Custodial: the master seed lives in the server's env. Fine for a
 *     hackathon demo; ERC-4337 / wallet delegation is the production fix.
 *   - Browser-safe: uses only viem primitives (keccak256, toHex,
 *     privateKeyToAccount). No Node crypto, no randombytes.
 *
 * The seed MUST be a 32-byte hex (66 chars including 0x). Generate once via:
 *   node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
 * and stash in `.env` as `AGENT_WALLET_SEED`. Regenerating the seed
 * RE-ASSIGNS every agent's wallet — funds at the old addresses become
 * unreachable. Treat the seed like a master key.
 */

import { keccak256, toBytes, toHex, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface AgentWallet {
  /** The derivation-anchored EVM address (matches iNFT tokenId 1:1) */
  address: Address;
  /** 0x-prefixed 32-byte private key. KEEP SECRET — server-only. */
  privateKey: Hex;
  /** Source tokenId (echoed for callers building UI labels) */
  tokenId: bigint;
}

const seedRegex = /^0x[0-9a-fA-F]{64}$/;

/**
 * Derive the deterministic sub-wallet for an iNFT.
 *
 * Throws if the seed is malformed (must be 0x + 64 hex chars). Throwing
 * loud is intentional: a silently-misshapen seed would generate a
 * different address than expected, stranding funds.
 */
export function getAgentWallet(
  tokenId: bigint,
  seed: Hex | string
): AgentWallet {
  if (!seedRegex.test(seed)) {
    throw new Error(
      `AGENT_WALLET_SEED must be a 0x-prefixed 32-byte hex (66 chars). ` +
        `Got length ${seed.length}.`
    );
  }
  // Pad tokenId to 32 bytes so keccak input is fixed-length per-token.
  // Concatenate seed (32B) + tokenId (32B) → 64B input. Keccak256 of
  // that gives us the per-agent private key.
  const tokenBytes = toHex(tokenId, { size: 32 });
  const concatHex = (seed + tokenBytes.slice(2)) as Hex;
  const privateKey = keccak256(toBytes(concatHex));
  const address = privateKeyToAccount(privateKey).address;
  return { address, privateKey, tokenId };
}

/**
 * Convenience: derive only the address (no private key materialization).
 * Useful for UI components that show "agent #X's wallet" without ever
 * needing to sign — keeps the private key from passing through
 * intermediate frames.
 */
export function getAgentAddress(
  tokenId: bigint,
  seed: Hex | string
): Address {
  return getAgentWallet(tokenId, seed).address;
}

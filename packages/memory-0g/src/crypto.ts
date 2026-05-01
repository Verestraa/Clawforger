/**
 * Client-side encryption helpers for 0G Storage blobs.
 *
 * Key derivation: an iNFT owner signs a fixed challenge string ("CLAWFORGER_KEY_v1")
 * with their wallet. The signature is HKDF'd into a 256-bit AES key. On iNFT
 * transfer, the new owner re-signs the challenge → new key → re-encrypted blob.
 * This matches the ERC-7857 secure-transfer semantics.
 *
 * The actual signature acquisition happens in the browser (wagmi) or a Node
 * wallet — this module just consumes a Hex signature and produces a CryptoKey.
 */

import type { Hex } from 'viem';

const KEY_DERIVATION_INFO = new TextEncoder().encode('clawforger-memory-key/v1');
const SIGNATURE_CHALLENGE = 'CLAWFORGER_KEY_v1';

/** Returns the EIP-191 message that an iNFT owner must sign to derive the key. */
export function keyDerivationChallenge(): string {
  return SIGNATURE_CHALLENGE;
}

/**
 * Derive a 256-bit AES-GCM key from a wallet signature using HKDF.
 * The signature acts as the input keying material.
 */
export async function deriveKeyFromSignature(signature: Hex): Promise<CryptoKey> {
  // Strip the 0x prefix and parse as bytes
  const hex = signature.startsWith('0x') ? signature.slice(2) : signature;
  const ikm = new Uint8Array(hex.length / 2);
  for (let i = 0; i < ikm.length; i++) {
    ikm[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: KEY_DERIVATION_INFO,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** JSON.stringify replacer that serializes BigInt as decimal strings. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** Encrypt a JSON-serializable value with AES-256-GCM. BigInts → decimal strings. */
export async function encrypt(key: CryptoKey, data: unknown): Promise<Uint8Array> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data, bigintReplacer));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );
  // Pack IV (12 bytes) + ciphertext into a single buffer
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

/** Decrypt a buffer produced by `encrypt()`. */
export async function decrypt(key: CryptoKey, blob: Uint8Array): Promise<unknown> {
  if (blob.length < 12) throw new Error('blob-too-short');
  const iv = blob.slice(0, 12);
  const ciphertext = blob.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/** keccak256-style helper (uses SHA-256 here for portability — for content addressing only) */
export async function contentHash(data: Uint8Array): Promise<Hex> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return ('0x' + Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

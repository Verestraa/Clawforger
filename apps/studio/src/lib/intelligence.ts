/**
 * Browser-side intelligence-blob helpers.
 *
 * Real 0G Storage upload + AES-256-GCM encryption lives in
 * `@clawforger/memory-0g`. For the live Studio demo we simplify:
 *
 *   1. Build a JSON payload from the persona inputs
 *   2. SHA-256 hash it → that's the on-chain `intelligenceHash`
 *   3. Persist the payload to localStorage keyed by hash so the
 *      agent-detail page can read it back
 *
 * This demonstrates the iNFT-with-content-addressed-pointer story
 * end-to-end without needing the 0G Storage SDK in the browser bundle.
 */

import type { Hex } from 'viem';

export interface PersonaPayload {
  name: string;
  systemPrompt: string;
  skills: unknown[];
  createdAt: number;
  ownerAddress: string;
}

const STORAGE_KEY_PREFIX = 'clawforger:agent-payload:';

export async function buildIntelligenceHash(payload: PersonaPayload): Promise<Hex> {
  const bytes = new TextEncoder().encode(canonicalize(payload));
  return sha256Hex(bytes);
}

export async function buildEmptySkillManifestHash(): Promise<Hex> {
  return sha256Hex(new TextEncoder().encode('[]'));
}

export function persistPayload(hash: Hex, payload: PersonaPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + hash, JSON.stringify(payload));
  } catch {
    /* swallow — localStorage may be full or disabled */
  }
}

export function loadPayload(hash: Hex): PersonaPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + hash);
    return raw ? (JSON.parse(raw) as PersonaPayload) : null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────

async function sha256Hex(data: Uint8Array): Promise<Hex> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return ('0x' +
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')) as Hex;
}

/** JSON.stringify with stable key ordering so the hash is deterministic. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

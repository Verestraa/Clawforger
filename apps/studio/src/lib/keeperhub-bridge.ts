/**
 * Browser → Server → KeeperHub bridge.
 *
 * The KeeperHub API key is sensitive — we keep it out of the browser bundle.
 * The Studio POSTs here, the x402-skill-market server holds the key + the
 * deployer fallback signer, and forwards through KeeperHubExecutor.
 *
 * That executor's `viemFallback` ensures we ALWAYS land a tx even if KH's
 * REST endpoints misbehave — the caller gets the same response shape.
 */

import type { Address, Hex } from 'viem';

const BRIDGE_URL = (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';

export interface MintViaKeeperHubParams {
  to: Address;
  intelligenceHash: Hex;
  skillManifestHash: Hex;
}

export interface MintViaKeeperHubResult {
  ok: boolean;
  /** KeeperHub run ID (or 'viem-fallback-...' when KH was unreachable) */
  workflowRunId: string;
  txHash?: Hex;
  blockNumber?: string;
  gasUsed?: string;
  retries: number;
  /** 'keeperhub' or 'viem-fallback' — which path actually broadcast the tx */
  route: 'keeperhub' | 'viem-fallback';
  error?: string;
  reason?: string;
}

/**
 * Submit a mint via the KeeperHub bridge endpoint.
 * Throws if the bridge server is unreachable; soft-fails (ok=false) for
 * downstream errors (insufficient funds, KH rejection, etc).
 */
export async function mintViaKeeperHub(
  params: MintViaKeeperHubParams
): Promise<MintViaKeeperHubResult> {
  const res = await fetch(`${BRIDGE_URL}/admin/mint-via-keeperhub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* fall through to error case */
  }

  if (!res.ok || !body) {
    throw new Error(
      `bridge ${res.status}: ${body?.reason ?? body?.error ?? 'unknown'}`
    );
  }

  return body as MintViaKeeperHubResult;
}

export async function bridgeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

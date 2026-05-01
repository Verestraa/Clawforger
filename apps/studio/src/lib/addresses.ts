/**
 * Loads contract addresses at runtime from /addresses.json (public/).
 * The Day-1 deploy script writes this file at the repo root; we copy it
 * into apps/studio/public/ during dev startup.
 */

export interface Addresses {
  chains: {
    ' 0g-galileo-testnet'?: {
      ClawforgerINFT?: string;
      SkillRegistry?: string;
      RoyaltyVaultTemplate?: string;
      mUSDC?: string;
    };
  };
}

let cached: Addresses | null = null;

export async function loadAddresses(): Promise<Addresses> {
  if (cached) return cached;
  const res = await fetch('/addresses.json').catch(() => null);
  if (!res || !res.ok) {
    cached = { chains: {} };
    return cached;
  }
  cached = (await res.json()) as Addresses;
  return cached;
}

export function getMarketUrl(): string {
  return import.meta.env.VITE_X402_MARKET_URL ?? 'http://localhost:3700';
}

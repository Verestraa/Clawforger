/**
 * AgentWalletBadge — compact inline wallet stat for the chat header.
 *
 * Shows live mUSDC + 0G balance for the agent. Lighter weight than
 * AgentWalletPanel (which is the full overview-tab card) — designed to
 * sit in a row alongside ComputePoolBadge / "0G memory" indicator.
 */

import { useEffect, useState } from 'react';
import { Coins, Wallet, Loader2 } from 'lucide-react';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ??
  'http://localhost:3700';

interface WalletInfo {
  ok: boolean;
  address?: string;
  mUSDC?: number;
  native0G?: number;
}

export function AgentWalletBadge({ tokenId }: { tokenId: string | bigint }) {
  const [data, setData] = useState<WalletInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`${MARKET_URL}/admin/agent/${tokenId}/wallet`)
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setData(j);
        })
        .catch(() => {
          if (!cancelled) setData({ ok: false });
        });
    load();
    // Refresh every 8s so judges see balance drop in real time after a buy
    const t = setInterval(load, 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tokenId]);

  if (!data) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
        <Loader2 size={11} className="animate-spin" /> wallet…
      </span>
    );
  }
  if (!data.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-yellow-500/80 font-mono">
        <Wallet size={11} /> wallet offline
      </span>
    );
  }
  const mUSDC = data.mUSDC ?? 0;
  const gas = data.native0G ?? 0;
  const tone =
    mUSDC >= 0.05
      ? 'text-emerald-400'
      : mUSDC > 0
        ? 'text-yellow-400'
        : 'text-zinc-500';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] ${tone} font-mono`}
      title={
        `agent wallet: ${data.address}\n` +
        `mUSDC:  ${mUSDC.toFixed(4)} (spending power)\n` +
        `0G:     ${gas.toFixed(4)} (gas)\n\n` +
        `Refreshes every 8s. Buys via purchase_skill drop mUSDC.`
      }
    >
      <Coins size={11} />
      {mUSDC.toFixed(2)} mUSDC
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-400">{gas.toFixed(3)} 0G</span>
    </span>
  );
}

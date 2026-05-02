/**
 * ComputePoolBadge — shows the live 0G Compute broker ledger for the
 * server's signing key. The studio's chat path is funded by THIS pool,
 * not the user's wallet — so the badge makes the cost model legible.
 *
 *   variant="inline"  small pill suitable for headers
 *   variant="banner"  full informational card for setup pages
 */

import { useEffect, useState } from 'react';
import { Cpu, Loader2, AlertTriangle } from 'lucide-react';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';

interface ComputeBalance {
  ok: boolean;
  walletAddress?: string;
  totalOG?: number;
  lockedOG?: number;
  availableOG?: number;
  minDepositOG?: number;
  minBalanceOG?: number;
  note?: string;
  reason?: string;
  info?: string;
}

export function ComputePoolBadge({
  variant = 'inline',
}: {
  variant?: 'inline' | 'banner';
}) {
  const [data, setData] = useState<ComputeBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${MARKET_URL}/admin/compute-balance`);
        const json = (await res.json()) as ComputeBalance;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled)
          setData({ ok: false, reason: `bridge unreachable: ${(err as Error).message.slice(0, 80)}` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (variant === 'inline') return <Inline data={data} loading={loading} />;
  return <Banner data={data} loading={loading} />;
}

function Inline({ data, loading }: { data: ComputeBalance | null; loading: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
        <Loader2 size={11} className="animate-spin" /> compute pool…
      </span>
    );
  }
  if (!data?.ok) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] text-yellow-500/80 font-mono"
        title={data?.reason ?? 'inference unavailable'}
      >
        <AlertTriangle size={11} /> compute pool offline
      </span>
    );
  }
  const avail = data.availableOG ?? 0;
  const tone =
    avail < (data.minBalanceOG ?? 0.5)
      ? 'text-red-400'
      : avail < 1
        ? 'text-yellow-400/90'
        : 'text-emerald-400/90';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] ${tone} font-mono`}
      title={
        `0G Compute broker ledger (server-funded, shared across all agents)\n` +
        `wallet:    ${data.walletAddress}\n` +
        `available: ${avail.toFixed(3)} 0G\n` +
        `locked:    ${(data.lockedOG ?? 0).toFixed(3)} 0G\n` +
        `total:     ${(data.totalOG ?? 0).toFixed(3)} 0G\n\n` +
        `Auto-tops up by ${data.minDepositOG} 0G when available drops below ${data.minBalanceOG} 0G.`
      }
    >
      <Cpu size={11} /> compute pool: {avail.toFixed(2)} 0G
    </span>
  );
}

function Banner({ data, loading }: { data: ComputeBalance | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 size={12} className="animate-spin" /> reading 0G Compute broker ledger…
      </div>
    );
  }
  if (!data?.ok) {
    return (
      <div className="card border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-400 space-y-2">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle size={12} /> 0G Compute pool unavailable
        </div>
        <p className="text-zinc-300">
          {data?.info ??
            'Bridge cannot reach the 0G Compute broker. Inference will fall back to mock responses.'}
        </p>
        {data?.minDepositOG !== undefined && (
          <p className="text-zinc-400">
            A fresh signing wallet needs ≥ <strong>{data.minDepositOG} 0G</strong> to create the
            broker account.
          </p>
        )}
      </div>
    );
  }
  const avail = data.availableOG ?? 0;
  const total = data.totalOG ?? 0;
  const locked = data.lockedOG ?? 0;
  const pct = total > 0 ? Math.min(100, (avail / total) * 100) : 0;
  const tone =
    avail < (data.minBalanceOG ?? 0.5)
      ? 'border-red-500/40 bg-red-500/5'
      : 'border-accent/30 bg-accent/5';
  return (
    <div className={`card ${tone} space-y-3 text-xs`}>
      <div className="flex items-center gap-2">
        <Cpu size={14} className="text-accent" />
        <span className="font-bold text-zinc-200">0G Compute pool</span>
        <span className="text-[10px] text-zinc-500 font-mono ml-auto truncate max-w-[200px]">
          {data.walletAddress}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-zinc-400">
          <span>available for inference</span>
          <span className="font-mono text-emerald-400">{avail.toFixed(3)} 0G</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
          <div
            className="h-full bg-emerald-500/60"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between text-[10px] text-zinc-500 font-mono">
          <span>locked: {locked.toFixed(3)} 0G</span>
          <span>total deposited: {total.toFixed(3)} 0G</span>
        </div>
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Chat with iNFTs runs through TEE-verified <strong>qwen-2.5-7b</strong> on 0G Compute. The
        server-side wallet pre-funds inference for every agent — <strong>users never pay per
        message</strong>. Auto-tops up by {data.minDepositOG} 0G when this falls below{' '}
        {data.minBalanceOG} 0G. A new operator wallet needs ≥ {data.minDepositOG} 0G to create the
        broker account in the first place.
      </p>
    </div>
  );
}

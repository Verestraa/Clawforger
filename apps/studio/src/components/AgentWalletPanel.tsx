/**
 * AgentWalletPanel — shows an agent's deterministic sub-wallet.
 *
 * Every iNFT (by tokenId) has a unique signing wallet derived from the
 * server-side AGENT_WALLET_SEED. Send mUSDC to this address to give the
 * agent buying power; the agent uses purchase_skill in chat to spend it.
 */

import { useEffect, useState } from 'react';
import { Wallet, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';
const EXPLORER = 'https://chainscan-galileo.0g.ai';

interface WalletInfo {
  ok: boolean;
  tokenId?: string;
  address?: string;
  native0G?: number;
  mUSDC?: number;
  reason?: string;
  info?: string;
}

export function AgentWalletPanel({ tokenId }: { tokenId: string }) {
  const [data, setData] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${MARKET_URL}/admin/agent/${tokenId}/wallet`);
      const json = (await res.json()) as WalletInfo;
      setData(json);
    } catch (err) {
      setData({ ok: false, reason: `bridge unreachable: ${(err as Error).message.slice(0, 80)}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tokenId]);

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  if (!data) {
    return (
      <div className="card md:col-span-2 text-xs text-zinc-500 flex items-center gap-2">
        <RefreshCw size={12} className="animate-spin" /> reading agent #{tokenId}'s sub-wallet…
      </div>
    );
  }

  if (!data.ok) {
    return (
      <div className="card md:col-span-2 border-yellow-500/30 bg-yellow-500/5 text-xs space-y-1">
        <div className="font-bold text-yellow-400 flex items-center gap-2">
          <Wallet size={12} /> agent wallet unavailable
        </div>
        <p className="text-zinc-400">{data.reason ?? 'unknown error'}</p>
      </div>
    );
  }

  const mUSDC = data.mUSDC ?? 0;
  const native = data.native0G ?? 0;
  const fundedTone = mUSDC > 0 ? 'text-emerald-400' : 'text-zinc-500';

  return (
    <div className="card md:col-span-2 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet size={14} className="text-accent" />
        <span className="font-bold text-zinc-200 text-sm">agent #{tokenId} wallet</span>
        <span className="text-[10px] text-zinc-500 ml-2">
          deterministic sub-wallet (derived from AGENT_WALLET_SEED + tokenId)
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto text-zinc-500 hover:text-accent disabled:opacity-50"
          title="refresh balances"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-[300px] text-[11px] font-mono text-zinc-300 bg-zinc-900/50 px-3 py-2 rounded border border-zinc-800 break-all">
          {data.address}
        </code>
        <button
          onClick={() => copy(data.address ?? '')}
          className="text-zinc-500 hover:text-accent text-xs flex items-center gap-1 px-2 py-1.5 rounded border border-zinc-800 hover:border-accent/50 transition"
          title="copy address"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'copied' : 'copy'}
        </button>
        <a
          href={`${EXPLORER}/address/${data.address}`}
          target="_blank"
          rel="noopener"
          className="text-zinc-500 hover:text-accent text-xs flex items-center gap-1 px-2 py-1.5 rounded border border-zinc-800 hover:border-accent/50 transition"
          title="open in chainscan"
        >
          <ExternalLink size={11} /> explorer
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase">mUSDC (spending)</div>
          <div className={`font-mono text-lg ${fundedTone}`}>
            {mUSDC.toFixed(4)}{' '}
            <span className="text-xs text-zinc-600">mUSDC</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase">0G (gas)</div>
          <div className={`font-mono text-lg ${native > 0 ? 'text-zinc-300' : 'text-zinc-500'}`}>
            {native.toFixed(4)}{' '}
            <span className="text-xs text-zinc-600">0G</span>
          </div>
        </div>
      </div>

      {mUSDC === 0 ? (
        <p className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-800 pt-2">
          This agent has no spendable funds. To let it{' '}
          <strong className="text-accent">buy data from other agents</strong>, send mUSDC + a small
          amount of 0G to the address above. Quickest path:
          <code className="block mt-1 bg-zinc-900/50 px-2 py-1 rounded text-[10px] font-mono">
            bun run scripts/fund-agent.ts {tokenId} 1.0
          </code>
        </p>
      ) : (
        <p className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-800 pt-2">
          This agent can buy skills from other agents. In chat, ask it to{' '}
          <em>"purchase the &lt;capability&gt; skill"</em> — its wallet signs an mUSDC.transfer to
          the producer's RoyaltyVault, then the skill executes and returns the result.
        </p>
      )}
    </div>
  );
}

/**
 * AgentCard — rich card for the agents list.
 *
 * Shows: deterministic avatar, name, tokenId, persona badge, wallet balances
 * (mUSDC + 0G), and skill count. Lazy-fetches its own data so the list
 * page doesn't need to coordinate per-agent fetches.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Coins, Sparkles, Wallet } from 'lucide-react';
import { AgentAvatar, PERSONA_TONE, PERSONA_SCOPE } from './AgentAvatar';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ??
  'http://localhost:3700';

interface WalletInfo {
  ok: boolean;
  address?: string;
  mUSDC?: number;
  native0G?: number;
}

interface AgentCardProps {
  tokenId: bigint;
  name: string;
  /** Pre-fetched by parent (one /skills call covers all agents) */
  skillCount?: number;
}

export function AgentCard({ tokenId, name, skillCount }: AgentCardProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  // Wallet info from the marketplace bridge (deterministic sub-wallet)
  useEffect(() => {
    let cancelled = false;
    fetch(`${MARKET_URL}/admin/agent/${tokenId}/wallet`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setWallet(j);
      })
      .catch(() => {
        if (!cancelled) setWallet({ ok: false });
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const personaTone = PERSONA_TONE[name];
  const scope = PERSONA_SCOPE[name];
  const fundedTone =
    (wallet?.mUSDC ?? 0) >= 0.05
      ? 'text-emerald-400'
      : (wallet?.mUSDC ?? 0) > 0
        ? 'text-yellow-400'
        : 'text-zinc-500';

  return (
    <Link
      to={`/agents/${tokenId}`}
      className="card hover:border-accent transition flex items-start gap-4 group"
    >
      <AgentAvatar tokenId={tokenId} name={name} size={64} />

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-lg group-hover:text-accent transition truncate">
            {name}
          </h3>
          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
            iNFT #{String(tokenId)}
          </span>
        </div>

        {/* Persona badge + scope */}
        {personaTone ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${personaTone}`}
            >
              {name.toLowerCase()}
            </span>
            {scope && (
              <span className="text-[10px] text-zinc-500">— {scope}</span>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-zinc-500">custom persona</div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/50">
          <Stat
            icon={<Coins size={11} />}
            label="mUSDC"
            value={
              wallet === null
                ? '…'
                : wallet.ok
                  ? (wallet.mUSDC ?? 0).toFixed(2)
                  : '—'
            }
            tone={fundedTone}
          />
          <Stat
            icon={<Wallet size={11} />}
            label="0G"
            value={
              wallet === null
                ? '…'
                : wallet.ok
                  ? (wallet.native0G ?? 0).toFixed(3)
                  : '—'
            }
            tone={
              (wallet?.native0G ?? 0) > 0.001
                ? 'text-zinc-300'
                : 'text-zinc-500'
            }
          />
          <Stat
            icon={<Sparkles size={11} />}
            label="skills"
            value={skillCount === undefined ? '…' : String(skillCount)}
            tone={
              (skillCount ?? 0) > 0 ? 'text-accent' : 'text-zinc-500'
            }
          />
        </div>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-mono text-sm ${tone}`}>{value}</div>
    </div>
  );
}

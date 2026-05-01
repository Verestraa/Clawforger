/**
 * TryItModal — runs a skill from the marketplace.
 *
 * For the live demo this hits the market server's free /skill/:hash/run
 * preview endpoint so judges see a real round-trip without needing the
 * x402 payment + mUSDC approval + settlement chain to all work in 90s.
 *
 * The full paid path is one toggle away: switch the fetch URL from
 * `/run` to `/` and add the X-Payment header — see paySkillAndCall in
 * @clawforger/x402-skill-market/client.
 */

import { useState } from 'react';
import { X, Coins, Play, Loader2, ExternalLink, Check } from 'lucide-react';
import type { Hex } from 'viem';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';
const EXPLORER = 'https://chainscan-galileo.0g.ai';

export interface TryItSkill {
  hash: Hex;
  capabilityTag: string;
  ownerTokenId: bigint;
  priceUSDC: bigint;
  txHash: Hex;
}

interface Props {
  skill: TryItSkill;
  onClose: () => void;
}

const PRESETS: Record<string, Record<string, string>> = {
  'fetch.arxiv': { paperId: '2604.27264' },
  'text.summarize': { text: 'Clawforger is a self-evolving agent framework on 0G.' },
};

export function TryItModal({ skill, onClose }: Props) {
  const presetInputs = PRESETS[skill.capabilityTag] ?? { input: '' };
  const [inputs, setInputs] = useState<Record<string, string>>(presetInputs);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch(`${MARKET_URL}/skill/${skill.hash}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`server ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      setResult(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-xl w-full max-h-[85vh] overflow-y-auto bg-zinc-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">try a skill</div>
            <h3 className="text-2xl font-bold mt-1">{skill.capabilityTag}</h3>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
              <span>
                from{' '}
                <span className="text-zinc-300">Agent #{String(skill.ownerTokenId)}</span>
              </span>
              <span className="flex items-center gap-1 text-accent">
                <Coins size={11} /> {fmtMUSDC(skill.priceUSDC)} mUSDC
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="border-t border-zinc-800 my-5" />

        {/* Inputs */}
        <div className="space-y-3">
          <div className="text-xs text-zinc-400 uppercase tracking-wider">inputs</div>
          {Object.keys(inputs).length === 0 ? (
            <div className="text-xs text-zinc-500">no inputs required</div>
          ) : (
            Object.entries(inputs).map(([key, value]) => (
              <div key={key}>
                <label className="text-xs text-zinc-500 mb-1 block">{key}</label>
                <input
                  className="input"
                  value={value}
                  onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                  disabled={running}
                />
              </div>
            ))
          )}
        </div>

        {/* Run button */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <a
            href={`${EXPLORER}/tx/${skill.txHash}`}
            target="_blank"
            rel="noopener"
            className="text-xs text-zinc-500 hover:text-accent flex items-center gap-1"
          >
            publish tx <ExternalLink size={11} />
          </a>
          <button
            onClick={run}
            disabled={running}
            className="btn btn-primary disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" /> running…
              </>
            ) : (
              <>
                <Play size={14} /> run skill
              </>
            )}
          </button>
        </div>

        {/* Result panel */}
        {(result || error) && (
          <div className="mt-6 border-t border-zinc-800 pt-4">
            {error && (
              <div className="card bg-red-950/40 border-red-900/50 text-sm text-red-300">
                <div className="font-bold mb-1">error</div>
                <pre className="text-xs whitespace-pre-wrap">{error}</pre>
              </div>
            )}
            {result !== null && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <Check size={14} /> skill returned
                </div>
                <pre className="card text-xs font-mono overflow-auto max-h-64 bg-zinc-950/80">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 text-[10px] text-zinc-600 text-center">
          live demo path: free preview · paid path with x402+KeeperHub coming next
        </div>
      </div>
    </div>
  );
}

function fmtMUSDC(units: bigint): string {
  if (units === 0n) return '0';
  const whole = units / 1_000_000n;
  const fraction = units % 1_000_000n;
  if (fraction === 0n) return whole.toLocaleString();
  return (Number(whole) + Number(fraction) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

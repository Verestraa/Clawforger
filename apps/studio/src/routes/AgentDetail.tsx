import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { Link } from 'react-router';
import {
  Brain,
  Sparkles,
  History,
  Coins,
  ExternalLink,
  MessageCircle,
  Database,
  MessageSquare,
  Wrench,
  Zap,
  RefreshCw,
  Loader2,
  Lock,
} from 'lucide-react';
import type { Address, Hex } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';
import {
  useAgentEvolution,
  useAgentSkills,
  type EvolutionEvent,
  type PublishedSkill,
} from '@/hooks/useAgentEvents';

const TABS = ['overview', 'skills', 'evolution', 'memory log'] as const;
const EXPLORER = 'https://chainscan-galileo.0g.ai';

export default function AgentDetail() {
  const { tokenId: tokenIdStr } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview');

  const tokenId = tokenIdStr ? BigInt(tokenIdStr) : undefined;

  // Read AgentData struct from the iNFT contract
  const {
    data: agentData,
    isLoading,
    error,
  } = useReadContract({
    address: ADDRESSES.ClawforgerINFT,
    abi: ABIS.ClawforgerINFT as any,
    functionName: 'agents',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  const { data: ownerAddress } = useReadContract({
    address: ADDRESSES.ClawforgerINFT,
    abi: ABIS.ClawforgerINFT as any,
    functionName: 'ownerOf',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  // ⚠️ All hooks MUST be called before any early-return so the hook order
  //   is consistent across renders (rules of hooks).
  const { events: evolutionEvents } = useAgentEvolution(tokenId);
  const { skills: publishedSkills } = useAgentSkills(tokenId);

  if (tokenId === undefined) {
    return <div className="card text-center text-zinc-500">invalid agent id</div>;
  }
  if (isLoading) {
    return <div className="card text-center text-zinc-500">loading agent #{tokenIdStr}…</div>;
  }
  if (error || !agentData) {
    return (
      <div className="card text-center text-red-400">
        agent #{tokenIdStr} not found —{' '}
        {error ? error.message.slice(0, 120) : 'no data'}
      </div>
    );
  }

  // Solidity struct returns as a tuple
  const [intelligenceHash, skillManifestHash, memoryRootHash, royaltyVault, evolvedAt] =
    agentData as readonly [Hex, Hex, Hex, Address, bigint];

  const personaPayload = loadPayload(intelligenceHash);
  const name = personaPayload?.name ?? `Agent #${tokenIdStr}`;

  const totalEarned = publishedSkills.reduce(
    (acc, s) => acc + (s.priceUSDC * 95n) / 100n,
    0n
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-accent/10 p-4 text-accent">
          <Brain size={32} />
        </div>
        <div className="flex-1">
          <div className="text-xs text-zinc-500">agent #{tokenIdStr}</div>
          <h1 className="text-3xl font-bold">{name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="pill">
              <Sparkles size={10} /> {publishedSkills.length} skill{publishedSkills.length === 1 ? '' : 's'}
            </span>
            <span className="pill">
              <Coins size={10} /> {fmtMUSDC(totalEarned)} mUSDC earned
            </span>
            <span className="pill">
              <History size={10} /> {evolutionEvents.filter((e) => e.kind === 'evolved').length} evolution{evolutionEvents.filter((e) => e.kind === 'evolved').length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Link
            to={`/agents/${tokenIdStr}/chat`}
            className="btn btn-primary text-xs"
            title="Talk to this agent via TEE-verified 0G Compute"
          >
            <MessageCircle size={12} /> chat
          </Link>
          <a
            href={`${EXPLORER}/address/${ADDRESSES.ClawforgerINFT}`}
            target="_blank"
            rel="noopener"
            className="btn text-xs"
          >
            on chain <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <div className="border-b border-zinc-800 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition whitespace-nowrap ${
              tab === t
                ? 'border-b-2 border-accent text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-[300px]">
        {tab === 'overview' && (
          <Overview
            intelligenceHash={intelligenceHash}
            skillManifestHash={skillManifestHash}
            memoryRootHash={memoryRootHash}
            royaltyVault={royaltyVault}
            evolvedAt={evolvedAt}
            ownerAddress={ownerAddress as Address | undefined}
            personaPrompt={personaPayload?.systemPrompt}
          />
        )}
        {tab === 'skills' && <Skills skills={publishedSkills} />}
        {tab === 'evolution' && <Evolution events={evolutionEvents} />}
        {tab === 'memory log' && <MemoryLog tokenIdStr={tokenIdStr} />}
      </div>
    </div>
  );
}

function Overview({
  intelligenceHash,
  skillManifestHash,
  memoryRootHash,
  royaltyVault,
  evolvedAt,
  ownerAddress,
  personaPrompt,
}: {
  intelligenceHash: Hex;
  skillManifestHash: Hex;
  memoryRootHash: Hex;
  royaltyVault: Address;
  evolvedAt: bigint;
  ownerAddress?: Address;
  personaPrompt?: string;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Detail label="owner" value={ownerAddress} link={ownerAddress ? `${EXPLORER}/address/${ownerAddress}` : undefined} />
      <Detail label="royalty vault" value={royaltyVault} link={`${EXPLORER}/address/${royaltyVault}`} />
      <Detail label="intelligence hash" value={intelligenceHash} />
      <Detail label="skill manifest hash" value={skillManifestHash} />
      <Detail label="memory root" value={isZeroHash(memoryRootHash) ? '— (no memory yet)' : memoryRootHash} />
      <Detail label="last evolved" value={evolvedAt > 0n ? new Date(Number(evolvedAt) * 1000).toLocaleString() : '—'} />
      <div className="card md:col-span-2 space-y-2">
        <div className="text-xs text-zinc-500 uppercase">personality</div>
        <p className="text-sm text-zinc-300 whitespace-pre-wrap">
          {personaPrompt ?? '(persona payload not in this browser — was minted on a different device)'}
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value, link }: { label: string; value?: string; link?: string }) {
  return (
    <div className="card space-y-2">
      <div className="text-xs text-zinc-500 uppercase">{label}</div>
      <div className="text-xs font-mono break-all text-zinc-300">
        {value ? (
          link ? (
            <a href={link} target="_blank" rel="noopener" className="hover:text-accent">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          '—'
        )}
      </div>
    </div>
  );
}

function Skills({ skills }: { skills: PublishedSkill[] }) {
  if (skills.length === 0) {
    return (
      <div className="card text-center text-zinc-500 text-sm">
        No skills yet — this agent hasn't evolved any skills it can sell. Run via CLI:{' '}
        <code className="text-accent">bun run examples/researcher/src/index.ts</code>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {skills.map((s) => (
        <a
          key={s.artifactHash}
          href={`${EXPLORER}/tx/${s.txHash}`}
          target="_blank"
          rel="noopener"
          className="card flex items-center gap-4 hover:border-accent transition"
        >
          <div className="flex-1">
            <div className="font-bold">{s.capabilityTag}</div>
            <div className="text-xs text-zinc-500 mt-1 font-mono">
              {s.artifactHash.slice(0, 12)}…{s.artifactHash.slice(-8)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-accent font-bold">{fmtMUSDC(s.priceUSDC)} mUSDC</div>
            <div className="text-xs text-zinc-500">{new Date(s.publishedAt).toLocaleDateString()}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function Evolution({ events }: { events: EvolutionEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="card text-center text-zinc-500 text-sm">loading on-chain history…</div>
    );
  }
  return (
    <div className="space-y-1">
      {events.map((e) => (
        <a
          key={e.txHash}
          href={`${EXPLORER}/tx/${e.txHash}`}
          target="_blank"
          rel="noopener"
          className="card py-3 flex items-center gap-4 text-sm hover:border-accent transition"
        >
          <div className="text-zinc-500 w-44 flex-shrink-0">
            {new Date(e.ts).toLocaleString()}
          </div>
          <div className={`pill ${e.kind === 'evolved' ? 'text-accent border-accent/40' : ''}`}>
            {e.kind}
          </div>
          <div className="text-zinc-300 flex-1 truncate">{e.detail}</div>
          <ExternalLink size={12} className="text-zinc-500 flex-shrink-0" />
        </a>
      ))}
    </div>
  );
}

interface LogEntry {
  kind: string;
  ts: number;
  data: any;
}

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';

function MemoryLog({ tokenIdStr }: { tokenIdStr?: string }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'chat' | 'skill' | 'other'>('all');

  async function load() {
    if (!tokenIdStr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${MARKET_URL}/admin/memory-log/${tokenIdStr}`);
      const json = await res.json();
      if (json.ok) setEntries(json.entries);
      else setError(json.reason ?? 'failed');
    } catch (err) {
      setError(`bridge unreachable: ${(err as Error).message.slice(0, 80)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tokenIdStr]);

  if (loading && !entries) {
    return (
      <div className="card text-xs text-zinc-500 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" /> reading encrypted log from 0G memory…
      </div>
    );
  }
  if (error) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-xs text-red-400 space-y-2">
        <div>⚠ {error}</div>
        <button
          onClick={load}
          className="text-zinc-400 hover:text-accent inline-flex items-center gap-1"
        >
          <RefreshCw size={11} /> retry
        </button>
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-xs text-emerald-400/80">
          <Lock size={12} /> log is empty but the channel is live
        </div>
        <p className="text-zinc-400 text-sm">
          No entries yet. Chat with this agent or evolve a new skill — every action is encrypted
          with a key derived from the iNFT owner and persisted to the agent's memory log on 0G
          Storage. The same iNFT can be transferred to another wallet and the new owner re-keys the
          log via secure transfer.
        </p>
      </div>
    );
  }

  const filtered = entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'chat') return e.kind.startsWith('chat.');
    if (filter === 'skill') return e.kind.startsWith('skill.') || e.kind.startsWith('evolve.');
    return !e.kind.startsWith('chat.') && !e.kind.startsWith('skill.') && !e.kind.startsWith('evolve.');
  });

  const counts = {
    all: entries.length,
    chat: entries.filter((e) => e.kind.startsWith('chat.')).length,
    skill: entries.filter((e) => e.kind.startsWith('skill.') || e.kind.startsWith('evolve.')).length,
    other: entries.filter(
      (e) => !e.kind.startsWith('chat.') && !e.kind.startsWith('skill.') && !e.kind.startsWith('evolve.')
    ).length,
  };

  return (
    <div className="space-y-3">
      <div className="card !p-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-400/80 font-mono">
          <Database size={11} /> {entries.length} encrypted entries on 0G Storage
        </span>
        <button
          onClick={load}
          className="ml-auto text-zinc-500 hover:text-accent inline-flex items-center gap-1"
        >
          <RefreshCw size={10} /> refresh
        </button>
      </div>

      <div className="flex gap-1 flex-wrap">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={`all (${counts.all})`} />
        <FilterPill active={filter === 'chat'} onClick={() => setFilter('chat')} label={`chat (${counts.chat})`} />
        <FilterPill active={filter === 'skill'} onClick={() => setFilter('skill')} label={`skills (${counts.skill})`} />
        <FilterPill active={filter === 'other'} onClick={() => setFilter('other')} label={`other (${counts.other})`} />
      </div>

      <div className="card !p-0 divide-y divide-zinc-900">
        {filtered.length === 0 && (
          <div className="px-5 py-6 text-center text-xs text-zinc-500">no entries match this filter</div>
        )}
        {filtered.map((e, i) => (
          <LogRow key={i} entry={e} />
        ))}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`pill text-[11px] ${active ? 'border-accent/60 text-accent bg-accent/10' : 'text-zinc-500 hover:text-zinc-300'}`}
    >
      {label}
    </button>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const tone = kindTone(entry.kind);
  return (
    <details className="group">
      <summary className="cursor-pointer px-4 py-3 flex items-center gap-3 select-none hover:bg-zinc-900/30">
        <span className={tone.bgClass + ' rounded p-1.5'}>
          <tone.Icon size={11} className={tone.fgClass} />
        </span>
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={`text-xs font-mono ${tone.fgClass}`}>{entry.kind}</span>
          <span className="text-[11px] text-zinc-300 truncate">{summarize(entry)}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">
          {new Date(entry.ts).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 text-[11px]">
        <pre className="text-zinc-300 font-mono bg-zinc-950/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {(() => {
            try {
              return JSON.stringify(entry.data, null, 2);
            } catch {
              return String(entry.data);
            }
          })()}
        </pre>
      </div>
    </details>
  );
}

function kindTone(kind: string): {
  Icon: typeof MessageSquare;
  bgClass: string;
  fgClass: string;
} {
  if (kind.startsWith('chat.'))
    return { Icon: MessageSquare, bgClass: 'bg-sky-500/10', fgClass: 'text-sky-400' };
  if (kind.startsWith('skill.') || kind.startsWith('evolve.'))
    return { Icon: Wrench, bgClass: 'bg-accent/10', fgClass: 'text-accent' };
  return { Icon: Zap, bgClass: 'bg-zinc-700/30', fgClass: 'text-zinc-400' };
}

function summarize(entry: LogEntry): string {
  const d = entry.data;
  if (entry.kind === 'chat.turn') {
    const role = d?.role ?? '?';
    const content = typeof d?.content === 'string' ? d.content : '';
    const head = content.length > 80 ? content.slice(0, 80) + '…' : content;
    if (role === 'user') return `you: ${head}`;
    if (role === 'assistant') {
      const inv = Array.isArray(d?.invocations) && d.invocations.length > 0
        ? ` · ${d.invocations.length} tool call${d.invocations.length === 1 ? '' : 's'}`
        : '';
      return `agent: ${head}${inv}`;
    }
    return `${role}: ${head}`;
  }
  if (typeof d?.summary === 'string') return d.summary;
  try {
    return JSON.stringify(d).slice(0, 90);
  } catch {
    return '';
  }
}

function isZeroHash(h: Hex): boolean {
  try {
    return BigInt(h) === 0n;
  } catch {
    return false;
  }
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

import { useParams } from 'react-router';
import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { Brain, Sparkles, History, Coins, ExternalLink } from 'lucide-react';
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

  const { events: evolutionEvents } = useAgentEvolution(tokenId);
  const { skills: publishedSkills } = useAgentSkills(tokenId);
  const totalEarned = publishedSkills.reduce(
    (acc, s) => acc + s.priceUSDC * 95n / 100n, // optimistic 95% × useCount=1; real total needs RoyaltyDistributed sum
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
        <a
          href={`${EXPLORER}/address/${ADDRESSES.ClawforgerINFT}`}
          target="_blank"
          rel="noopener"
          className="btn text-xs"
        >
          on chain <ExternalLink size={12} />
        </a>
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
        {tab === 'memory log' && <MemoryLog />}
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

function MemoryLog() {
  return (
    <div className="card">
      <p className="text-zinc-500 text-sm">No log entries yet — run a task to populate memory.</p>
    </div>
  );
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

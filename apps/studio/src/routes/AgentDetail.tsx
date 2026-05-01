import { useParams } from 'react-router';
import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { Brain, Sparkles, History, Coins, ExternalLink } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';

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
              <Sparkles size={10} /> 0 skills
            </span>
            <span className="pill">
              <Coins size={10} /> 0 mUSDC earned
            </span>
            <span className="pill">
              <History size={10} /> evolved {evolvedAt > 0n ? '1+' : '0'}×
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
        {tab === 'skills' && <Skills />}
        {tab === 'evolution' && <Evolution evolvedAt={evolvedAt} />}
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

function Skills() {
  return (
    <div className="card text-center text-zinc-500 text-sm">
      No skills yet — give this agent a task that exceeds its current capability and it will evolve one. (Run via CLI:{' '}
      <code className="text-accent">bun run examples/researcher/src/index.ts</code>)
    </div>
  );
}

function Evolution({ evolvedAt }: { evolvedAt: bigint }) {
  const events = [
    {
      ts: evolvedAt > 0n ? new Date(Number(evolvedAt) * 1000).toLocaleString() : 'just now',
      kind: 'minted',
      detail: 'agent born',
    },
  ];
  return (
    <div className="space-y-1">
      {events.map((e, i) => (
        <div key={i} className="card py-3 flex items-center gap-4 text-sm">
          <div className="text-zinc-500 w-44 flex-shrink-0">{e.ts}</div>
          <div className="pill">{e.kind}</div>
          <div className="text-zinc-300">{e.detail}</div>
        </div>
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

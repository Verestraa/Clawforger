import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { usePublicClient } from 'wagmi';
import { Search, Coins, Play, Loader2, ExternalLink } from 'lucide-react';
import { parseAbiItem, type Address, type Hex } from 'viem';
import { ADDRESSES } from '@/lib/contracts';

const EXPLORER = 'https://chainscan-galileo.0g.ai';

const SKILL_PUBLISHED = parseAbiItem(
  'event SkillPublished(bytes32 indexed artifactHash, address indexed ownerINFT, uint256 ownerTokenId, string capabilityTag, uint256 priceUSDC)'
);

interface MarketSkill {
  artifactHash: Hex;
  capabilityTag: string;
  ownerTokenId: bigint;
  priceUSDC: bigint;
  publishedAt: number;
  txHash: Hex;
}

export default function Market() {
  const publicClient = usePublicClient();
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<MarketSkill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const logs = await publicClient.getLogs({
          address: ADDRESSES.SkillRegistry,
          event: SKILL_PUBLISHED,
          args: { ownerINFT: ADDRESSES.ClawforgerINFT as Address },
          fromBlock: 'earliest',
          toBlock: 'latest',
        });

        const items: MarketSkill[] = await Promise.all(
          logs.map(async (l) => {
            const block = await publicClient.getBlock({ blockNumber: l.blockNumber });
            return {
              artifactHash: l.args.artifactHash as Hex,
              capabilityTag: l.args.capabilityTag as string,
              ownerTokenId: l.args.ownerTokenId as bigint,
              priceUSDC: l.args.priceUSDC as bigint,
              publishedAt: Number(block.timestamp) * 1000,
              txHash: l.transactionHash as Hex,
            };
          })
        );

        if (!cancelled) setSkills(items.sort((a, b) => b.publishedAt - a.publishedAt));
      } catch (err) {
        console.warn('market query failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  const filtered = useMemo(() => {
    if (!query) return skills;
    const q = query.toLowerCase();
    return skills.filter((s) => s.capabilityTag.toLowerCase().includes(q));
  }, [skills, query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">skill marketplace</h1>
        <p className="text-zinc-400 text-sm mt-1">
          On-chain skill registry. Each call is a sub-cent x402 mUSDC payment, settled via KeeperHub.
        </p>
      </div>

      <div className="card flex items-center gap-3">
        <Search size={16} className="text-zinc-500" />
        <input
          className="bg-transparent flex-1 outline-none text-sm"
          placeholder="search by capability tag (e.g. fetch.arxiv)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-xs text-zinc-500 tabular-nums">
          {loading ? '…' : `${filtered.length}/${skills.length}`}
        </span>
      </div>

      {loading && (
        <div className="card text-center text-zinc-500 text-sm flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          querying SkillRegistry events…
        </div>
      )}

      {!loading && skills.length === 0 && (
        <div className="card space-y-3 text-center">
          <p className="text-zinc-500 text-sm">No skills published yet on the registry.</p>
          <p className="text-xs text-zinc-600">
            To populate this marketplace, mint an agent and run the self-evolution loop:
          </p>
          <code className="block text-xs text-accent bg-zinc-900 p-3 rounded mx-auto inline-block">
            bun run examples/researcher/src/index.ts
          </code>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.artifactHash} className="card flex items-center gap-4">
              <div className="flex-1">
                <div className="font-bold">{s.capabilityTag}</div>
                <div className="text-xs text-zinc-500 mt-1 font-mono break-all">
                  {s.artifactHash.slice(0, 14)}…{s.artifactHash.slice(-8)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  from{' '}
                  <Link to={`/agents/${s.ownerTokenId}`} className="text-accent hover:underline">
                    Agent #{String(s.ownerTokenId)}
                  </Link>{' '}
                  · published {new Date(s.publishedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-accent font-bold">
                  <Coins size={14} /> {fmtMUSDC(s.priceUSDC)} mUSDC
                </div>
              </div>
              <a
                href={`${EXPLORER}/tx/${s.txHash}`}
                target="_blank"
                rel="noopener"
                className="btn text-xs"
                title="view publish tx on chainscan"
              >
                <ExternalLink size={12} />
              </a>
              <button className="btn">
                <Play size={14} /> try it
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && skills.length > 0 && filtered.length === 0 && (
        <div className="card text-center text-zinc-500 text-sm">
          No skills match "{query}".
        </div>
      )}
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

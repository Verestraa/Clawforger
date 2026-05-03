import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseAbiItem, type Address } from 'viem';
import { ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';
import { AgentCard } from '@/components/AgentCard';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ??
  'http://localhost:3700';

interface AgentSummary {
  tokenId: bigint;
  name: string;
}

const AGENT_MINTED_EVENT = parseAbiItem(
  'event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault)'
);

interface MarketplaceSkill {
  hash: string;
  ownerINFT?: { tokenId: string };
  ownerTokenId?: string;
}

export default function AgentsList() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [skillCounts, setSkillCounts] = useState<Map<string, number>>(
    new Map()
  );

  // Load agents owned by connected wallet
  useEffect(() => {
    if (!address || !publicClient) return;
    setLoading(true);
    (async () => {
      try {
        const logs = await publicClient.getLogs({
          address: ADDRESSES.ClawforgerINFT,
          event: AGENT_MINTED_EVENT,
          args: { owner: address as Address },
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        const items: AgentSummary[] = await Promise.all(
          logs.map(async (l) => {
            const tokenId = l.args.tokenId as bigint;
            const intelligenceHash = l.args.intelligenceHash as `0x${string}`;
            const local = loadPayload(intelligenceHash);
            if (local?.name) {
              // Opportunistic backfill: if this client has the persona in
              // localStorage, push it to the server so other origins can
              // resolve it. Server returns 409 if already registered, so
              // this is idempotent.
              void backfillPersonaToServer(tokenId, local.name, local.systemPrompt, address);
              return { tokenId, name: local.name };
            }
            const remote = await fetchPersonaFromServer(tokenId);
            return { tokenId, name: remote?.name ?? `Agent #${tokenId}` };
          })
        );
        setAgents(items.sort((a, b) => Number(b.tokenId - a.tokenId)));
      } catch (err) {
        console.error('agents list query failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [address, publicClient]);

  // One bulk fetch of all marketplace skills, then count per tokenId.
  // Cheaper than N parallel chain reads when the user has many agents.
  useEffect(() => {
    let cancelled = false;
    fetch(`${MARKET_URL}/skills`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.skills ?? [];
        const counts = new Map<string, number>();
        for (const s of list as MarketplaceSkill[]) {
          const tid = String(s.ownerINFT?.tokenId ?? s.ownerTokenId ?? '');
          if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
        }
        setSkillCounts(counts);
      })
      .catch(() => {
        // silent — cards will show "…" or 0
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">your agents</h1>
        <p className="text-zinc-400 text-sm mt-1">
          iNFT agents owned by your connected wallet on 0G Galileo. Each has a
          deterministic sub-wallet for buying skills from other agents.
        </p>
      </div>

      {!isConnected && (
        <div className="card text-center space-y-3 py-10">
          <p className="text-zinc-200 font-medium">Connect a wallet to see your iNFT agents.</p>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Or mint your first agent in 30 seconds — pick a persona, sign a tx on 0G Galileo,
            done.
          </p>
          <div className="pt-1">
            <Link to="/mint" className="btn btn-primary">
              Mint your first agent →
            </Link>
          </div>
        </div>
      )}

      {isConnected && loading && (
        <div className="card text-center text-zinc-300 text-sm">
          Reading on-chain ClawforgerINFT events…
        </div>
      )}

      {isConnected && !loading && agents.length === 0 && (
        <div className="card text-center space-y-3 py-10">
          <p className="text-zinc-200 font-medium">No iNFT agents minted to this wallet yet.</p>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Mint a Researcher, Writer, Trader, or Analyst — each becomes an ERC-7857 iNFT
            with its own deterministic signing wallet.
          </p>
          <div className="pt-1">
            <Link to="/mint" className="btn btn-primary">
              Mint your first agent →
            </Link>
          </div>
        </div>
      )}

      {agents.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <AgentCard
              key={String(a.tokenId)}
              tokenId={a.tokenId}
              name={a.name}
              skillCount={skillCounts.get(String(a.tokenId)) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchPersonaFromServer(
  tokenId: bigint
): Promise<{ name: string; systemPrompt: string } | null> {
  try {
    const res = await fetch(`${MARKET_URL}/admin/agent/${String(tokenId)}/persona`);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; persona?: { name: string; systemPrompt: string } };
    return data.ok && data.persona ? data.persona : null;
  } catch {
    return null;
  }
}

async function backfillPersonaToServer(
  tokenId: bigint,
  name: string,
  systemPrompt: string,
  ownerAddress: string
): Promise<void> {
  try {
    await fetch(`${MARKET_URL}/admin/agent/${String(tokenId)}/persona`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, systemPrompt, ownerAddress }),
    });
  } catch {
    /* best-effort */
  }
}

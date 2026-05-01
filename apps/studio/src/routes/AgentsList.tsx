import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Brain } from 'lucide-react';
import { parseAbiItem, type Address } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';

interface AgentSummary {
  tokenId: bigint;
  name: string;
}

const AGENT_MINTED_EVENT = parseAbiItem(
  'event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault)'
);

export default function AgentsList() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || !publicClient) return;
    setLoading(true);
    (async () => {
      try {
        // Query AgentMinted events filtered by this owner
        const logs = await publicClient.getLogs({
          address: ADDRESSES.ClawforgerINFT,
          event: AGENT_MINTED_EVENT,
          args: { owner: address as Address },
          fromBlock: 'earliest',
          toBlock: 'latest',
        });

        const items: AgentSummary[] = logs.map((l) => {
          const tokenId = l.args.tokenId as bigint;
          const intelligenceHash = l.args.intelligenceHash as `0x${string}`;
          const payload = loadPayload(intelligenceHash);
          return { tokenId, name: payload?.name ?? `Agent #${tokenId}` };
        });

        setAgents(items.sort((a, b) => Number(b.tokenId - a.tokenId)));
      } catch (err) {
        console.error('agents list query failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [address, publicClient]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">your agents</h1>
        <p className="text-zinc-400 text-sm mt-1">
          iNFT agents owned by your connected wallet on 0G Galileo.
        </p>
      </div>

      {!isConnected && (
        <div className="card text-center text-zinc-500">
          connect a wallet to see your agents.
        </div>
      )}

      {isConnected && loading && (
        <div className="card text-center text-zinc-500">loading agents…</div>
      )}

      {isConnected && !loading && agents.length === 0 && (
        <div className="card text-center text-zinc-500">
          No agents minted yet. <Link to="/mint" className="text-accent">Mint one →</Link>
        </div>
      )}

      {agents.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <Link
              key={String(a.tokenId)}
              to={`/agents/${a.tokenId}`}
              className="card hover:border-accent transition flex items-start gap-4"
            >
              <div className="rounded-lg bg-accent/10 p-3 text-accent">
                <Brain />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-lg">{a.name}</h3>
                  <span className="text-xs text-zinc-500">#{String(a.tokenId)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

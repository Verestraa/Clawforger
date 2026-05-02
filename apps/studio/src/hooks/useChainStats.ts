import { useEffect, useState } from 'react';
import { useBlockNumber, usePublicClient, useReadContract } from 'wagmi';
import { parseAbiItem } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';

const AGENT_MINTED_EVENT = parseAbiItem(
  'event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault)'
);

const ROYALTY_DISTRIBUTED_EVENT = parseAbiItem(
  'event RoyaltyDistributed(uint256 toOwner, uint256 toProtocol, address indexed currentOwner)'
);

interface ChainStats {
  agentsMinted: number | null;
  skillsPublished: number | null;
  mUSDCSettled: bigint | null;
  blockHeight: number | null;
  loading: boolean;
}

export function useChainStats(): ChainStats {
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [agentsMinted, setAgentsMinted] = useState<number | null>(null);
  const [mUSDCSettled, setMUSDCSettled] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);

  // Skills count from SkillRegistry
  const { data: skillsRaw } = useReadContract({
    address: ADDRESSES.SkillRegistry,
    abi: ABIS.SkillRegistry as any,
    functionName: 'totalSkills',
    query: { refetchInterval: 15_000 },
  });

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        // 0G Galileo RPC caps eth_getLogs to ~500k blocks per query in
        // practice (the documented "2.7M" applies only to address-filtered
        // queries, not topic-only ones). All deploy-5 contracts are within
        // the last few thousand blocks so a 500k window covers everything.
        const tip = blockNumber ?? (await publicClient.getBlockNumber());
        const WINDOW = 500_000n;
        const from = tip > WINDOW ? tip - WINDOW : 0n;

        // Count AgentMinted events (address-filtered, scoped to iNFT)
        const agentLogs = await publicClient.getLogs({
          address: ADDRESSES.ClawforgerINFT,
          event: AGENT_MINTED_EVENT,
          fromBlock: from,
          toBlock: tip,
        });
        if (cancelled) return;
        setAgentsMinted(agentLogs.length);

        // Sum RoyaltyDistributed events across ALL per-agent vaults. No
        // address filter — we rely on the event-topic match. Bounded by
        // the same ~2.5M block window so the RPC accepts the query.
        const royaltyLogs = await publicClient.getLogs({
          event: ROYALTY_DISTRIBUTED_EVENT,
          fromBlock: from,
          toBlock: tip,
        });
        if (cancelled) return;
        let settled = 0n;
        for (const log of royaltyLogs) {
          const args = log.args as { toOwner?: bigint; toProtocol?: bigint };
          if (typeof args.toOwner === 'bigint') settled += args.toOwner;
          if (typeof args.toProtocol === 'bigint') settled += args.toProtocol;
        }
        setMUSDCSettled(settled);
      } catch (err) {
        console.warn('chain stats query failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, blockNumber]);

  return {
    agentsMinted,
    skillsPublished: skillsRaw !== undefined ? Number(skillsRaw as bigint) : null,
    mUSDCSettled,
    blockHeight: blockNumber !== undefined ? Number(blockNumber) : null,
    loading,
  };
}

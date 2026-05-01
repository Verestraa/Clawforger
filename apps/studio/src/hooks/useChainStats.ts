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
        // Count AgentMinted events ever
        const agentLogs = await publicClient.getLogs({
          address: ADDRESSES.ClawforgerINFT,
          event: AGENT_MINTED_EVENT,
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        if (cancelled) return;
        setAgentsMinted(agentLogs.length);

        // Sum RoyaltyDistributed.toOwner across the iNFT contract scope.
        // (Each RoyaltyVault is a separate contract; for hackathon scope we
        //  query without an address filter — Foundry chain has few events.)
        // Quick-and-dirty: leave at 0 until skill payments start happening.
        setMUSDCSettled(0n);
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

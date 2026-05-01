import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, type Address, type Hex } from 'viem';
import { ADDRESSES } from '@/lib/contracts';

export interface EvolutionEvent {
  ts: number; // ms
  kind: 'minted' | 'evolved' | 'transferred';
  detail: string;
  txHash: Hex;
  blockNumber: number;
}

export interface PublishedSkill {
  artifactHash: Hex;
  capabilityTag: string;
  priceUSDC: bigint;
  publishedAt: number;
  txHash: Hex;
}

const AGENT_MINTED = parseAbiItem(
  'event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault)'
);
const AGENT_EVOLVED = parseAbiItem(
  'event AgentEvolved(uint256 indexed tokenId, bytes32 newSkillManifestHash, bytes32 newMemoryRootHash, uint256 ts)'
);
const SECURE_TRANSFER = parseAbiItem(
  'event SecureTransfer(uint256 indexed tokenId, address indexed from, address indexed to, bytes32 newIntelligenceHash)'
);
const SKILL_PUBLISHED = parseAbiItem(
  'event SkillPublished(bytes32 indexed artifactHash, address indexed ownerINFT, uint256 ownerTokenId, string capabilityTag, uint256 priceUSDC)'
);

/** All lifecycle events for a given iNFT, sorted oldest-first. */
export function useAgentEvolution(tokenId: bigint | undefined): {
  events: EvolutionEvent[];
  loading: boolean;
} {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicClient || tokenId === undefined) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [mintedLogs, evolvedLogs, transferLogs] = await Promise.all([
          publicClient.getLogs({
            address: ADDRESSES.ClawforgerINFT,
            event: AGENT_MINTED,
            args: { tokenId },
            fromBlock: 'earliest',
            toBlock: 'latest',
          }),
          publicClient.getLogs({
            address: ADDRESSES.ClawforgerINFT,
            event: AGENT_EVOLVED,
            args: { tokenId },
            fromBlock: 'earliest',
            toBlock: 'latest',
          }),
          publicClient.getLogs({
            address: ADDRESSES.ClawforgerINFT,
            event: SECURE_TRANSFER,
            args: { tokenId },
            fromBlock: 'earliest',
            toBlock: 'latest',
          }),
        ]);

        // Block timestamps for human-readable dates
        const blockNumbers = new Set<bigint>();
        for (const l of [...mintedLogs, ...evolvedLogs, ...transferLogs]) {
          blockNumbers.add(l.blockNumber);
        }
        const blockTs = new Map<bigint, number>();
        await Promise.all(
          Array.from(blockNumbers).map(async (bn) => {
            const block = await publicClient.getBlock({ blockNumber: bn });
            blockTs.set(bn, Number(block.timestamp) * 1000);
          })
        );

        const out: EvolutionEvent[] = [];
        for (const l of mintedLogs) {
          out.push({
            ts: blockTs.get(l.blockNumber) ?? 0,
            kind: 'minted',
            detail: `agent born — minted to ${shortAddr(l.args.owner as Address)}`,
            txHash: l.transactionHash as Hex,
            blockNumber: Number(l.blockNumber),
          });
        }
        for (const l of evolvedLogs) {
          out.push({
            ts: blockTs.get(l.blockNumber) ?? 0,
            kind: 'evolved',
            detail: `evolved — new skill manifest ${(l.args.newSkillManifestHash as Hex).slice(0, 10)}…`,
            txHash: l.transactionHash as Hex,
            blockNumber: Number(l.blockNumber),
          });
        }
        for (const l of transferLogs) {
          out.push({
            ts: blockTs.get(l.blockNumber) ?? 0,
            kind: 'transferred',
            detail: `secure transfer to ${shortAddr(l.args.to as Address)} (re-encrypted)`,
            txHash: l.transactionHash as Hex,
            blockNumber: Number(l.blockNumber),
          });
        }
        out.sort((a, b) => a.ts - b.ts);

        if (!cancelled) setEvents(out);
      } catch (err) {
        console.warn('agent evolution query failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, tokenId]);

  return { events, loading };
}

/** Skills published by this agent (queried from SkillRegistry events). */
export function useAgentSkills(tokenId: bigint | undefined): {
  skills: PublishedSkill[];
  loading: boolean;
} {
  const publicClient = usePublicClient();
  const [skills, setSkills] = useState<PublishedSkill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicClient || tokenId === undefined) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // SkillPublished is indexed on artifactHash + ownerINFT — not on tokenId,
        // so we filter client-side after fetching all.
        const logs = await publicClient.getLogs({
          address: ADDRESSES.SkillRegistry,
          event: SKILL_PUBLISHED,
          args: { ownerINFT: ADDRESSES.ClawforgerINFT },
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        const filtered = logs.filter(
          (l) => (l.args.ownerTokenId as bigint) === tokenId
        );
        const items: PublishedSkill[] = await Promise.all(
          filtered.map(async (l) => {
            const block = await publicClient.getBlock({ blockNumber: l.blockNumber });
            return {
              artifactHash: l.args.artifactHash as Hex,
              capabilityTag: l.args.capabilityTag as string,
              priceUSDC: l.args.priceUSDC as bigint,
              publishedAt: Number(block.timestamp) * 1000,
              txHash: l.transactionHash as Hex,
            };
          })
        );
        if (!cancelled) setSkills(items.sort((a, b) => b.publishedAt - a.publishedAt));
      } catch (err) {
        console.warn('agent skills query failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, tokenId]);

  return { skills, loading };
}

function shortAddr(a: Address): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

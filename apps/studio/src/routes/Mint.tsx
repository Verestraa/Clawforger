import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { decodeEventLog, parseAbiItem, type Hex } from 'viem';
import { toast } from 'sonner';
import { Wallet, Zap, ExternalLink } from 'lucide-react';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import {
  buildEmptySkillManifestHash,
  buildIntelligenceHash,
  persistPayload,
} from '@/lib/intelligence';
import { mintViaKeeperHub } from '@/lib/keeperhub-bridge';
import { ComputePoolBadge } from '@/components/ComputePoolBadge';

const SAMPLE_PERSONAS = [
  {
    name: 'Researcher',
    prompt:
      'You are Researcher. You find, fetch, and summarize academic literature. When existing skills cannot solve a task, you design a new tool, sandbox-test it, and publish.',
  },
  {
    name: 'Writer',
    prompt:
      'You are Writer. You compose well-structured prose. You purchase research data from other agents via x402 when you need facts.',
  },
  {
    name: 'Trader',
    prompt:
      'You are Trader. You manage a treasury. You autonomously rebalance holdings when balances drift past targets, settling every action through KeeperHub.',
  },
];

const EXPLORER = 'https://chainscan-galileo.0g.ai';

const AGENT_MINTED_EVENT = parseAbiItem(
  'event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 intelligenceHash, address royaltyVault)'
);

type Route = 'wallet' | 'keeperhub';

export default function Mint() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [route, setRoute] = useState<Route>('keeperhub');
  const [khStatus, setKhStatus] = useState<string | null>(null);

  // wagmi path
  const {
    writeContractAsync,
    data: txHash,
    isPending: isSending,
    reset,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // wagmi path: navigate after receipt
  useEffect(() => {
    if (!isSuccess || !receipt) return;
    let tokenId: bigint | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ADDRESSES.ClawforgerINFT.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: ABIS.ClawforgerINFT as any,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'AgentMinted') {
          tokenId = (decoded.args as { tokenId: bigint }).tokenId;
          break;
        }
      } catch {
        /* not the event we're looking for */
      }
    }
    if (tokenId !== undefined) {
      toast.success(`Agent #${tokenId} minted`);
      navigate(`/agents/${tokenId}`);
    } else {
      toast.success('Agent minted (tokenId not parsed)');
    }
    reset();
  }, [isSuccess, receipt, navigate, reset]);

  async function handleMint() {
    if (!isConnected || !address) {
      toast.error('Connect a wallet first');
      return;
    }
    if (!name || !prompt) {
      toast.error('Name and persona prompt are required');
      return;
    }

    // Build the persona payload + hash (shared across both routes)
    const payload = {
      name,
      systemPrompt: prompt,
      skills: [],
      createdAt: Math.floor(Date.now() / 1000),
      ownerAddress: address,
    };
    const intelligenceHash: Hex = await buildIntelligenceHash(payload);
    const skillManifestHash: Hex = await buildEmptySkillManifestHash();
    persistPayload(intelligenceHash, payload);

    if (route === 'wallet') {
      try {
        const hash = await writeContractAsync({
          address: ADDRESSES.ClawforgerINFT,
          abi: ABIS.ClawforgerINFT as any,
          functionName: 'mintAgent',
          args: [address, intelligenceHash, skillManifestHash],
        });
        toast.message('mint submitted', {
          description: `tx ${hash.slice(0, 10)}…${hash.slice(-6)}`,
        });
      } catch (err) {
        toast.error('mint failed', { description: (err as Error).message.slice(0, 120) });
      }
      return;
    }

    // KeeperHub route — server-side bridge
    try {
      setKhStatus('compiling workflow…');
      const result = await mintViaKeeperHub({
        to: address,
        intelligenceHash,
        skillManifestHash,
      });

      if (!result.ok) {
        toast.error('KeeperHub mint failed', { description: result.error?.slice(0, 120) });
        setKhStatus(null);
        return;
      }

      toast.success(
        result.route === 'keeperhub'
          ? `KeeperHub run ${result.workflowRunId.slice(0, 14)}… complete`
          : `viem fallback succeeded (KH unreachable) — tx ${result.txHash?.slice(0, 10)}…`
      );

      // The KH path doesn't return a typed receipt — query for the tokenId
      // by reading the AgentMinted event for our wallet, newest first.
      setKhStatus('finding new tokenId on chain…');
      const tokenId = await pollNewestMint(address, publicClient);
      setKhStatus(null);
      if (tokenId !== undefined) {
        navigate(`/agents/${tokenId}`);
      }
    } catch (err) {
      setKhStatus(null);
      const msg = (err as Error).message;
      toast.error('bridge unreachable', {
        description: `Make sure you ran 'bun run market'. (${msg.slice(0, 80)})`,
      });
    }
  }

  /** After a KH mint, query AgentMinted for `owner` and return the highest tokenId. */
  async function pollNewestMint(
    owner: `0x${string}`,
    pc: ReturnType<typeof usePublicClient>
  ): Promise<bigint | undefined> {
    if (!pc) return undefined;
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      try {
        const logs = await pc.getLogs({
          address: ADDRESSES.ClawforgerINFT,
          event: AGENT_MINTED_EVENT,
          args: { owner },
          fromBlock: 'earliest',
          toBlock: 'latest',
        });
        if (logs.length > 0) {
          // Pick the newest — sort by blockNumber desc
          logs.sort((a, b) => Number(b.blockNumber - a.blockNumber));
          return logs[0]!.args.tokenId as bigint;
        }
      } catch {
        /* keep polling */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return undefined;
  }

  const wagmiBusy = isSending || isConfirming;
  const minting = wagmiBusy || khStatus !== null;
  const status =
    route === 'wallet'
      ? isSending
        ? 'sign in your wallet…'
        : isConfirming
          ? 'waiting for chain confirmation…'
          : null
      : khStatus;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">mint a Clawforger agent</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Hashes the persona, mints an ERC-7857 iNFT to your wallet on 0G Galileo.
        </p>
      </div>

      <ComputePoolBadge variant="banner" />

      {/* Route toggle */}
      <div className="card !p-2 flex gap-1">
        <RouteOption
          active={route === 'keeperhub'}
          onClick={() => setRoute('keeperhub')}
          icon={<Zap size={14} />}
          title="via KeeperHub"
          subtitle="server-side workflow execution"
          disabled={minting}
        />
        <RouteOption
          active={route === 'wallet'}
          onClick={() => setRoute('wallet')}
          icon={<Wallet size={14} />}
          title="via your wallet"
          subtitle="direct viem submission, you sign"
          disabled={minting}
        />
      </div>

      <div className="card space-y-5">
        <Field label="name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Researcher"
            disabled={minting}
          />
        </Field>
        <Field label="personality / system prompt">
          <textarea
            className="input min-h-[140px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="You are an autonomous agent that…"
            disabled={minting}
          />
        </Field>

        <div className="text-xs text-zinc-500">
          quick presets:
          <div className="flex gap-2 mt-2">
            {SAMPLE_PERSONAS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setName(p.name);
                  setPrompt(p.prompt);
                }}
                disabled={minting}
                className="pill hover:border-accent disabled:opacity-50"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500 flex-1">
            {status ?? (
              <>
                iNFT:{' '}
                <a
                  href={`${EXPLORER}/address/${ADDRESSES.ClawforgerINFT}`}
                  target="_blank"
                  rel="noopener"
                  className="text-zinc-400 hover:text-accent"
                >
                  {ADDRESSES.ClawforgerINFT.slice(0, 10)}…{' '}
                  <ExternalLink size={10} className="inline" />
                </a>
              </>
            )}
          </span>
          <button
            onClick={handleMint}
            disabled={!name || !prompt || minting || !isConnected}
            className="btn btn-primary disabled:opacity-50"
          >
            {minting ? 'minting…' : 'mint agent'}
          </button>
        </div>
      </div>

      {!isConnected && (
        <p className="text-sm text-zinc-500 text-center">
          connect a wallet to mint.
        </p>
      )}

      {route === 'keeperhub' && (
        <p className="text-xs text-zinc-600 text-center">
          KeeperHub route requires the bridge server running locally:{' '}
          <code className="text-accent">bun run market</code>
        </p>
      )}
    </div>
  );
}

function RouteOption({
  active,
  onClick,
  icon,
  title,
  subtitle,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center gap-3 rounded-lg p-3 text-left transition disabled:opacity-50 ${
        active
          ? 'bg-accent/10 border border-accent/40 text-zinc-100'
          : 'bg-zinc-900/40 border border-transparent text-zinc-400 hover:bg-zinc-900/80'
      }`}
    >
      <div className={active ? 'text-accent' : ''}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
      </div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-zinc-400 mb-1.5 uppercase tracking-wider">{label}</div>
      {children}
    </label>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { decodeEventLog, type Hex } from 'viem';
import { toast } from 'sonner';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import {
  buildEmptySkillManifestHash,
  buildIntelligenceHash,
  persistPayload,
} from '@/lib/intelligence';

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

export default function Mint() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

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

  // After confirmation, parse the AgentMinted event for the tokenId and navigate
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
    try {
      // 1. Build the persona payload + hash
      const payload = {
        name,
        systemPrompt: prompt,
        skills: [],
        createdAt: Math.floor(Date.now() / 1000),
        ownerAddress: address,
      };
      const intelligenceHash: Hex = await buildIntelligenceHash(payload);
      const skillManifestHash: Hex = await buildEmptySkillManifestHash();

      // 2. Persist payload locally so /agents/:tokenId can read it
      persistPayload(intelligenceHash, payload);

      // 3. Submit the on-chain mint
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
      const msg = (err as Error).message;
      toast.error('mint failed', { description: msg.slice(0, 120) });
    }
  }

  const minting = isSending || isConfirming;
  const status = isSending
    ? 'sign in your wallet…'
    : isConfirming
      ? 'waiting for chain confirmation…'
      : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">mint a Clawforger agent</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Hashes the persona, mints an ERC-7857 iNFT to your wallet on 0G Galileo.
        </p>
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

        <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {status ?? `iNFT contract: ${ADDRESSES.ClawforgerINFT.slice(0, 10)}…`}
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
    </div>
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

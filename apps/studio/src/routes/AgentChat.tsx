/**
 * AgentChat — talk to a live iNFT agent.
 *
 * Loads the agent's persona by:
 *   1. Reading iNFT.agents(tokenId) → intelligenceHash
 *   2. Looking up the persona payload in localStorage by hash
 *      (would be 0G Storage in a fully-wired build)
 *
 * Each user message → POST /admin/chat → server proxies through
 * ZGComputeInference (TEE-verified qwen-2.5-7b on 0G Compute) →
 * response renders with a "TEE verified ✓" seal.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router';
import { useReadContract } from 'wagmi';
import {
  Send,
  Loader2,
  Brain,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import type { Address, Hex } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  chatID?: string | null;
  verified?: boolean;
  providerAddress?: string;
  model?: string;
  error?: string;
}

export default function AgentChat() {
  const { tokenId: tokenIdStr } = useParams();
  const tokenId = tokenIdStr ? BigInt(tokenIdStr) : undefined;

  const { data: agentData, isLoading } = useReadContract({
    address: ADDRESSES.ClawforgerINFT,
    abi: ABIS.ClawforgerINFT as any,
    functionName: 'agents',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  const [draft, setDraft] = useState('');
  const [transcript, setTranscript] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, sending]);

  if (tokenId === undefined) {
    return <div className="card text-center text-zinc-500">invalid agent id</div>;
  }
  if (isLoading || !agentData) {
    return <div className="card text-center text-zinc-500">loading agent #{tokenIdStr}…</div>;
  }

  const [intelligenceHash] = agentData as readonly [Hex, Hex, Hex, Address, bigint];
  const persona = loadPayload(intelligenceHash);
  const personaPrompt =
    persona?.systemPrompt ?? `You are an autonomous AI agent (Clawforger #${tokenIdStr}).`;
  const agentName = persona?.name ?? `Agent #${tokenIdStr}`;

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const userTurn: ChatTurn = { role: 'user', content };
    const nextTranscript = [...transcript, userTurn];
    setTranscript(nextTranscript);
    setDraft('');

    try {
      const messages = nextTranscript.map((t) => ({ role: t.role, content: t.content }));
      const res = await fetch(`${MARKET_URL}/admin/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: personaPrompt, messages }),
      });
      const json = await res.json();
      if (!json.ok) {
        setTranscript([
          ...nextTranscript,
          { role: 'assistant', content: '', error: json.reason ?? 'chat failed' },
        ]);
        return;
      }
      setTranscript([
        ...nextTranscript,
        {
          role: 'assistant',
          content: json.content,
          chatID: json.chatID,
          verified: json.verified,
          providerAddress: json.providerAddress,
          model: json.model,
        },
      ]);
    } catch (err) {
      setTranscript([
        ...nextTranscript,
        {
          role: 'assistant',
          content: '',
          error: `bridge unreachable: ${(err as Error).message.slice(0, 80)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Link
          to={`/agents/${tokenIdStr}`}
          className="text-zinc-500 hover:text-accent flex items-center gap-1 text-xs"
        >
          <ArrowLeft size={12} /> back to agent
        </Link>
      </div>

      {/* Header */}
      <div className="card flex items-start gap-4">
        <div className="rounded-xl bg-accent/10 p-3 text-accent">
          <Brain size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zinc-500">live chat with iNFT</div>
          <h1 className="text-2xl font-bold">{agentName}</h1>
          <p className="text-xs text-zinc-500 mt-1 truncate">
            persona loaded from intelligenceHash{' '}
            <span className="font-mono text-zinc-400">{intelligenceHash.slice(0, 12)}…</span>
          </p>
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="card !p-0 max-h-[55vh] overflow-y-auto bg-zinc-950/40"
      >
        {transcript.length === 0 ? (
          <EmptyState personaPrompt={personaPrompt} />
        ) : (
          <div className="divide-y divide-zinc-900">
            {transcript.map((turn, i) => (
              <Turn key={i} turn={turn} agentName={agentName} />
            ))}
            {sending && (
              <div className="px-5 py-4 text-xs text-zinc-500 flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" /> {agentName} is thinking via 0G Compute…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="card !p-3 flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Message ${agentName}…  (Enter to send, Shift+Enter newline)`}
          rows={2}
          className="input flex-1 resize-none"
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="btn btn-primary disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          send
        </button>
      </div>

      <div className="text-[10px] text-zinc-600 text-center">
        responses generated by qwen-2.5-7b-instruct in a TEE on{' '}
        <a href="https://docs.0g.ai" target="_blank" rel="noopener" className="hover:text-accent">
          0G Compute Network
        </a>
        . each reply carries a chatID; processResponse() verifies the TEE signature.
      </div>
    </div>
  );
}

function Turn({ turn, agentName }: { turn: ChatTurn; agentName: string }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`px-5 py-4 ${isUser ? 'bg-zinc-900/30' : ''}`}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className={`text-xs font-bold ${isUser ? 'text-zinc-400' : 'text-accent'}`}>
          {isUser ? 'you' : agentName.toLowerCase()}
        </span>
        {!isUser && turn.model && (
          <span className="text-[10px] text-zinc-600 font-mono truncate">{turn.model}</span>
        )}
        {!isUser && turn.verified !== undefined && (
          <VerifyBadge
            verified={turn.verified}
            chatID={turn.chatID ?? null}
            providerAddress={turn.providerAddress}
          />
        )}
      </div>
      {turn.error ? (
        <div className="text-sm text-red-400">⚠ {turn.error}</div>
      ) : (
        <div className="text-sm text-zinc-200 whitespace-pre-wrap">{turn.content}</div>
      )}
    </div>
  );
}

function VerifyBadge({
  verified,
  chatID,
  providerAddress,
}: {
  verified: boolean;
  chatID: string | null;
  providerAddress?: string;
}) {
  if (verified) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-emerald-400/80 font-mono ml-auto"
        title={`chatID: ${chatID ?? 'n/a'}\nprovider: ${providerAddress ?? 'n/a'}`}
      >
        <ShieldCheck size={11} /> TEE verified
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-yellow-500/70 font-mono ml-auto"
      title={`chatID: ${chatID ?? 'n/a'}`}
    >
      <ShieldAlert size={11} /> unverified
    </span>
  );
}

function EmptyState({ personaPrompt }: { personaPrompt: string }) {
  return (
    <div className="px-6 py-10 text-center space-y-4">
      <div className="inline-flex items-center gap-2 pill text-accent border-accent/40">
        <Sparkles size={11} /> persona loaded
      </div>
      <p className="text-xs text-zinc-500 max-w-md mx-auto whitespace-pre-wrap leading-relaxed">
        {personaPrompt.length > 240 ? personaPrompt.slice(0, 240) + '…' : personaPrompt}
      </p>
      <p className="text-xs text-zinc-600">type a message below to start the conversation</p>
    </div>
  );
}

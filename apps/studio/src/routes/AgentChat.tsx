/**
 * AgentChat — talk to a live iNFT agent.
 *
 * Loads the agent's persona by:
 *   1. Reading iNFT.agents(tokenId) → intelligenceHash
 *   2. Looking up the persona payload in localStorage by hash
 *      (would be 0G Storage in a fully-wired build)
 *
 * Each user message → POST /admin/chat → server proxies through
 * ZGComputeInference (TEE-verified DeepSeek V3 on 0G Compute Aristotle
 * mainnet) → response renders with a "TEE verified ✓" seal.
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
  Wrench,
  Trash2,
  Database,
  Lightbulb,
} from 'lucide-react';
import type { Address, Hex } from 'viem';
import { ABIS, ADDRESSES } from '@/lib/contracts';
import { loadPayload } from '@/lib/intelligence';
import { ComputePoolBadge } from '@/components/ComputePoolBadge';
import { AgentAvatar, PERSONA_TONE } from '@/components/AgentAvatar';
import { AgentWalletBadge } from '@/components/AgentWalletBadge';
import { PromptExamplesModal } from '@/components/PromptExamplesModal';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';

interface SkillInvocation {
  name: string;
  capabilityTag: string;
  skillHash: string;
  arguments: unknown;
  output: unknown;
  error?: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  chatID?: string | null;
  verified?: boolean;
  providerAddress?: string;
  model?: string;
  error?: string;
  invocations?: SkillInvocation[];
  toolsExposed?: string[];
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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showExamples, setShowExamples] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Server-side persona fallback (used when localStorage is empty —
  // e.g. running on production after minting on localhost). Same source
  // of truth used by AgentsList + AgentDetail.
  const [serverPersona, setServerPersona] = useState<{
    name: string;
    systemPrompt: string;
  } | null>(null);
  useEffect(() => {
    if (!tokenIdStr) return;
    let cancelled = false;
    fetch(`${MARKET_URL}/admin/agent/${tokenIdStr}/persona`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok || !data.persona) return;
        setServerPersona({
          name: data.persona.name,
          systemPrompt: data.persona.systemPrompt,
        });
      })
      .catch(() => {
        /* server unreachable — localStorage is the fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [tokenIdStr]);

  // Load encrypted chat history from the agent's 0G memory log on mount.
  // Server reads agents/<tokenId>/__log_index__ from FileBackedZGStorage,
  // decrypts each chat.turn entry with the deployer-derived key, and
  // returns them in order. Survives page refresh + server restart.
  useEffect(() => {
    if (!tokenIdStr) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${MARKET_URL}/admin/chat-history/${tokenIdStr}`);
        const json = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.history)) {
          const turns: ChatTurn[] = json.history.map((h: any) => ({
            role: h.role,
            content: h.content ?? '',
            chatID: h.chatID,
            verified: h.verified,
            providerAddress: h.providerAddress,
            model: h.model,
            invocations: h.invocations,
          }));
          setTranscript(turns);
        }
      } catch {
        /* offline — start with empty transcript */
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenIdStr]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, sending]);

  async function clearHistory() {
    if (!tokenIdStr) return;
    if (!window.confirm('Clear all chat history for this iNFT? Encrypted log will be wiped.'))
      return;
    try {
      await fetch(`${MARKET_URL}/admin/chat-history/${tokenIdStr}`, { method: 'DELETE' });
      setTranscript([]);
    } catch (err) {
      console.warn('clear failed:', err);
    }
  }

  if (tokenId === undefined) {
    return <div className="card text-center text-zinc-500">invalid agent id</div>;
  }
  if (isLoading || !agentData) {
    return <div className="card text-center text-zinc-500">loading agent #{tokenIdStr}…</div>;
  }

  const [intelligenceHash] = agentData as readonly [Hex, Hex, Hex, Address, bigint];
  const persona = loadPayload(intelligenceHash);
  const personaPrompt =
    persona?.systemPrompt ??
    serverPersona?.systemPrompt ??
    `You are an autonomous AI agent (Clawforger #${tokenIdStr}).`;
  const agentName = persona?.name ?? serverPersona?.name ?? `Agent #${tokenIdStr}`;

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
        body: JSON.stringify({
          systemPrompt: personaPrompt,
          messages,
          agentTokenId: tokenIdStr,
        }),
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
          invocations: json.invocations as SkillInvocation[] | undefined,
          toolsExposed: json.toolsExposed as string[] | undefined,
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
        {tokenId !== undefined ? (
          <AgentAvatar tokenId={tokenId} name={agentName} size={64} />
        ) : (
          <div className="rounded-xl bg-accent/10 p-3 text-accent">
            <Brain size={24} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-zinc-500">live chat with iNFT</div>
            {PERSONA_TONE[agentName] && (
              <span
                className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${PERSONA_TONE[agentName]}`}
              >
                {agentName.toLowerCase()}
              </span>
            )}
            <ComputePoolBadge variant="inline" />
            {tokenId !== undefined && (
              <AgentWalletBadge tokenId={String(tokenId)} />
            )}
            <span
              className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400/80 font-mono"
              title="Conversation is encrypted with a key derived from the iNFT owner and persisted to the agent's memory log on 0G Storage. Survives refresh + server restart."
            >
              <Database size={11} /> 0G memory
            </span>
          </div>
          <h1 className="text-2xl font-bold">{agentName}</h1>
          <p className="text-xs text-zinc-500 mt-1 truncate">
            persona loaded from intelligenceHash{' '}
            <span className="font-mono text-zinc-400">{intelligenceHash.slice(0, 12)}…</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5 self-start flex-shrink-0">
          <button
            onClick={() => setShowExamples(true)}
            className="text-[10px] text-zinc-400 hover:text-accent flex items-center gap-1 border border-zinc-800 hover:border-accent/40 rounded px-2 py-1 transition"
            title="show example prompts you can run end-to-end"
          >
            <Lightbulb size={11} /> examples
          </button>
          {transcript.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-1"
              title="wipe encrypted chat log"
            >
              <Trash2 size={11} /> clear
            </button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="card !p-0 max-h-[55vh] overflow-y-auto bg-zinc-950/40"
      >
        {historyLoading ? (
          <div className="px-6 py-10 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <Loader2 size={12} className="animate-spin" /> loading encrypted history from 0G memory…
          </div>
        ) : transcript.length === 0 ? (
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
        responses generated by DeepSeek V3 in a TEE on{' '}
        <a href="https://docs.0g.ai" target="_blank" rel="noopener" className="hover:text-accent">
          0G Compute Aristotle mainnet
        </a>
        . each reply carries a chatID; processResponse() verifies the TEE signature.
      </div>

      {showExamples && (
        <PromptExamplesModal
          agentName={agentName}
          onUse={(prompt) => {
            setDraft(prompt);
            setShowExamples(false);
          }}
          onClose={() => setShowExamples(false)}
        />
      )}
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
        <>
          {turn.invocations && turn.invocations.length > 0 && (
            <div className="space-y-2 mb-3">
              {turn.invocations.map((inv, i) => (
                <ToolCard key={i} invocation={inv} />
              ))}
            </div>
          )}
          <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
            <RichText text={turn.content} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Tiny inline-markdown renderer. Handles only what agent replies actually
 * use: [text](url), **bold**, `code`, and bare URLs.
 *
 * Deliberately does NOT auto-link bare 0x hex strings. Reason: chat
 * replies carry both tx hashes AND skill artifact hashes (the latter
 * live on 0G Storage, not on chain). Auto-linking everything sent
 * users to chainscan /notfound for skill hashes. The consumer directive
 * now emits explicit markdown links [short…](url) for txes — those
 * land here and render fine.
 */
function RichText({ text }: { text: string }) {
  if (!text) return null;
  // Split on known markdown patterns; emit React nodes inline.
  // Pattern order matters — link first so its [text] doesn't get mangled.
  const parts: Array<string | React.ReactNode> = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      parts.push(buf);
      buf = '';
    }
  };
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/y;
  const boldRe = /\*\*([^*]+)\*\*/y;
  const codeRe = /`([^`]+)`/y;
  // Bare https URL
  const urlRe = /(https?:\/\/[^\s)]+)/y;
  while (i < text.length) {
    linkRe.lastIndex = i;
    boldRe.lastIndex = i;
    codeRe.lastIndex = i;
    urlRe.lastIndex = i;
    const link = linkRe.exec(text);
    if (link && link.index === i) {
      flush();
      parts.push(
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener"
          className="text-accent underline hover:text-accent/80"
        >
          {link[1]}
        </a>
      );
      i += link[0].length;
      continue;
    }
    const bold = boldRe.exec(text);
    if (bold && bold.index === i) {
      flush();
      parts.push(
        <strong key={i} className="text-zinc-100 font-semibold">
          {bold[1]}
        </strong>
      );
      i += bold[0].length;
      continue;
    }
    const code = codeRe.exec(text);
    if (code && code.index === i) {
      flush();
      parts.push(
        <code
          key={i}
          className="text-[12px] bg-zinc-900/50 px-1 py-0.5 rounded font-mono text-zinc-300"
        >
          {code[1]}
        </code>
      );
      i += code[0].length;
      continue;
    }
    const url = urlRe.exec(text);
    if (url && url.index === i) {
      flush();
      parts.push(
        <a
          key={i}
          href={url[1]}
          target="_blank"
          rel="noopener"
          className="text-accent underline hover:text-accent/80 break-all"
        >
          {url[1]}
        </a>
      );
      i += url[0].length;
      continue;
    }
    buf += text[i];
    i++;
  }
  flush();
  return <>{parts}</>;
}

function ToolCard({ invocation }: { invocation: SkillInvocation }) {
  const isForge = invocation.name === 'evolve_new_skill';
  const argsStr = (() => {
    try {
      return JSON.stringify(invocation.arguments, null, 2);
    } catch {
      return String(invocation.arguments);
    }
  })();
  const outputStr = (() => {
    try {
      return JSON.stringify(invocation.output, null, 2);
    } catch {
      return String(invocation.output);
    }
  })();
  return (
    <details
      className={`rounded-md border ${
        isForge
          ? 'border-fuchsia-500/40 bg-fuchsia-500/5'
          : 'border-accent/30 bg-accent/5'
      }`}
    >
      <summary className="cursor-pointer px-3 py-2 text-xs flex items-center gap-2 select-none">
        {isForge ? (
          <Sparkles size={11} className="text-fuchsia-400" />
        ) : (
          <Wrench size={11} className="text-accent" />
        )}
        <span className={`font-mono ${isForge ? 'text-fuchsia-400' : 'text-accent'}`}>
          {isForge ? `evolved → ${invocation.capabilityTag}` : invocation.capabilityTag}
        </span>
        {invocation.skillHash && (
          <span className="text-[10px] text-zinc-500 font-mono ml-auto">
            {invocation.skillHash.slice(0, 10)}…
          </span>
        )}
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-2 text-[11px]">
        {invocation.error ? (
          <div className="text-red-400 font-mono">{invocation.error}</div>
        ) : (
          <>
            <div>
              <div className="text-zinc-500 mb-0.5">arguments</div>
              <pre className="text-zinc-300 font-mono bg-zinc-950/60 rounded p-2 overflow-x-auto">
                {argsStr}
              </pre>
            </div>
            <div>
              <div className="text-zinc-500 mb-0.5">output</div>
              <pre className="text-emerald-300/90 font-mono bg-zinc-950/60 rounded p-2 overflow-x-auto">
                {outputStr}
              </pre>
            </div>
          </>
        )}
      </div>
    </details>
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

/**
 * PromptExamplesModal — persona-aware demo prompt picker.
 *
 * Surfaces a curated list of "things this agent can do right now",
 * grouped into:
 *   - Forge — generate + publish a brand-new skill on-chain
 *   - Use   — call a skill the agent already owns
 *   - Buy   — purchase a skill from another agent on the marketplace
 *
 * Click "Use this" → fills the chat draft and closes the modal.
 * Producers (Researcher / Writer / Trader) get Forge + Use.
 * Consumers (Analyst) get Buy + Use.
 */

import { X, Sparkles, ShoppingCart, Wand2, Wrench } from 'lucide-react';

interface PromptExample {
  kind: 'forge' | 'buy' | 'use';
  title: string;
  subtitle: string;
  prompt: string;
}

interface Props {
  agentName: string;
  onUse: (prompt: string) => void;
  onClose: () => void;
}

const RESEARCHER: PromptExample[] = [
  {
    kind: 'forge',
    title: 'Forge wiki.lookup',
    subtitle: 'Generate a skill that fetches Wikipedia summaries, then run it.',
    prompt:
      'Forge a wiki.lookup skill that fetches a short summary for any topic from the Wikipedia REST API, then call it for "Bitcoin".',
  },
  {
    kind: 'forge',
    title: 'Forge fetch.arxiv',
    subtitle: 'Self-evolve an arXiv abstract fetcher.',
    prompt:
      'Forge a fetch.arxiv skill that pulls the title, authors, and abstract for any arXiv paperId, then call it for paperId "2401.12345".',
  },
  {
    kind: 'use',
    title: 'Use an existing skill',
    subtitle: 'If you already forged wiki.lookup, just ask the question.',
    prompt: 'Look up "Ethereum" on Wikipedia and summarize what it says.',
  },
];

const WRITER: PromptExample[] = [
  {
    kind: 'forge',
    title: 'Forge text.summarize',
    subtitle: 'Generate a skill that compresses long text into 2 sentences.',
    prompt:
      'Forge a text.summarize skill that takes a `text` string and returns a 2-sentence summary using a no-auth LLM-free heuristic (first + last sentence). Then summarize: "Clawforger is a self-evolving agent framework on 0G where every agent is an ERC-7857 iNFT with its own wallet, evolves new skills on demand, and trades them via x402."',
  },
  {
    kind: 'forge',
    title: 'Forge define.term',
    subtitle: 'Fetch a term definition from Wikipedia.',
    prompt:
      'Forge a define.term skill that uses the Wikipedia REST summary endpoint to return a one-line definition for any term, then call it for "iNFT".',
  },
  {
    kind: 'use',
    title: 'Plain-text task',
    subtitle: 'Ask the agent for any writing help — no skill needed.',
    prompt:
      'Write a 2-sentence Twitter post explaining what Clawforger does for a developer audience.',
  },
];

const TRADER: PromptExample[] = [
  {
    kind: 'forge',
    title: 'Forge price.token',
    subtitle: 'Crypto price fetcher via CryptoCompare (no auth).',
    prompt:
      'Forge a price.token skill that fetches the USD price for any crypto symbol using CryptoCompare, then call it for "ETH".',
  },
  {
    kind: 'forge',
    title: 'Forge defi.tvl',
    subtitle: 'Fetch protocol TVL from DefiLlama (no auth).',
    prompt:
      'Forge a defi.tvl skill that returns total value locked for a given protocol slug from DefiLlama, then call it for "aave".',
  },
  {
    kind: 'use',
    title: 'Quick price check',
    subtitle: 'Use an existing price skill.',
    prompt: 'Get me the current BTC price.',
  },
];

const ANALYST: PromptExample[] = [
  {
    kind: 'buy',
    title: 'Buy a price lookup',
    subtitle: 'Find price.token on the marketplace and pay 0.05 mUSDC.',
    prompt: 'Get me the current ETH price.',
  },
  {
    kind: 'buy',
    title: 'Buy a wiki summary',
    subtitle: 'Find wiki.lookup on the marketplace and pay 0.05 mUSDC.',
    prompt: 'Look up "Ethereum" on Wikipedia and tell me what it says.',
  },
  {
    kind: 'buy',
    title: 'Compare two prices',
    subtitle: 'Multiple buys in one chat — one per token.',
    prompt: 'Compare ETH and BTC prices for me.',
  },
  {
    kind: 'use',
    title: 'Plain question',
    subtitle: 'No skill — just chat.',
    prompt: 'What kinds of skills can I buy from other agents right now?',
  },
];

const FALLBACK: PromptExample[] = [
  {
    kind: 'forge',
    title: 'Forge a new skill',
    subtitle: 'Generic capability — make this agent do something new.',
    prompt:
      'Forge a fetch.weather skill that returns the current weather for a city using the Open-Meteo API (no auth), then call it for "Tokyo".',
  },
  {
    kind: 'use',
    title: 'Just chat',
    subtitle: 'Talk to the agent without forging anything.',
    prompt: 'Tell me what skills you have right now and what you can do.',
  },
];

function pickExamples(agentName: string): PromptExample[] {
  const lower = agentName.toLowerCase();
  if (lower.includes('researcher')) return RESEARCHER;
  if (lower.includes('writer')) return WRITER;
  if (lower.includes('trader')) return TRADER;
  if (lower.includes('analyst')) return ANALYST;
  return FALLBACK;
}

export function PromptExamplesModal({ agentName, onUse, onClose }: Props) {
  const examples = pickExamples(agentName);
  const groups: { kind: PromptExample['kind']; label: string; icon: any }[] = [
    { kind: 'forge', label: 'Forge a new skill', icon: Wand2 },
    { kind: 'buy', label: 'Buy a skill', icon: ShoppingCart },
    { kind: 'use', label: 'Use / chat', icon: Wrench },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-zinc-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={11} className="text-accent" /> demo prompts
            </div>
            <h3 className="text-2xl font-bold mt-1">Try {agentName}</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Curated prompts proven to work end-to-end. Click "Use this" to drop
              one into the chat, then send.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100"
            title="close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 mt-5">
          {groups.map((g) => {
            const items = examples.filter((e) => e.kind === g.kind);
            if (items.length === 0) return null;
            const Icon = g.icon;
            return (
              <section key={g.kind} className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
                  <Icon size={12} className="text-accent" /> {g.label}
                </div>
                <div className="grid gap-2">
                  {items.map((ex, i) => (
                    <PromptCard key={i} example={ex} onUse={onUse} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="text-[11px] text-zinc-500 pt-4 mt-5 border-t border-zinc-800 leading-relaxed">
          Forge prompts trigger real on-chain transactions
          (SkillRegistry.publishSkill on 0G Galileo). Buy prompts trigger real
          mUSDC transfers from this agent's deterministic sub-wallet — make sure
          you've funded it via{' '}
          <code className="text-accent">
            bun run scripts/fund-agent.ts &lt;tokenId&gt; 1.0
          </code>{' '}
          first.
        </div>
      </div>
    </div>
  );
}

function PromptCard({
  example,
  onUse,
}: {
  example: PromptExample;
  onUse: (prompt: string) => void;
}) {
  return (
    <div className="card !p-3 space-y-2 bg-zinc-950/60 hover:border-accent/40 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100">{example.title}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{example.subtitle}</div>
        </div>
        <button
          onClick={() => onUse(example.prompt)}
          className="btn btn-primary text-[11px] !py-1 !px-2.5 flex-shrink-0"
          title="fill the chat input with this prompt"
        >
          use this →
        </button>
      </div>
      <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950/80 rounded p-2 whitespace-pre-wrap break-words border border-zinc-900">
        {example.prompt}
      </pre>
    </div>
  );
}

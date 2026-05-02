/**
 * Demo — guided walkthrough of the live on-chain agent economy.
 *
 * Deliberately NO simulated steps, NO fake timers, NO placeholder hashes.
 * Every "evidence" link points to a real receipt on chainscan-galileo,
 * every action button takes you to the real flow that actually executes
 * on chain. The page is a curator, not a faker.
 */

import { Link } from 'react-router';
import {
  ArrowRight,
  Sparkles,
  ShoppingCart,
  Anchor,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import { AgentAvatar } from '@/components/AgentAvatar';

const EXPLORER = 'https://chainscan-galileo.0g.ai';

// Pinned real receipts from verified production runs. Update this list
// when you re-record so the proof points are current. Each entry is a
// real tx hash from a real onchain event — DO NOT add placeholders.
const REAL_RECEIPTS: Array<{
  label: string;
  txHash: string;
  blockHint: string;
  detail: string;
}> = [
  {
    label: 'Analyst → Researcher · wiki.lookup purchase',
    txHash:
      '0xf17306f7361c428ab650b8bcdef2cb75798b49a8e032b31ad668d7f0e7820747',
    blockHint: 'block 31,167,323',
    detail: '0.05 mUSDC settled to iNFT #35’s RoyaltyVault',
  },
  {
    label: 'Analyst → Trader · price.token purchase',
    txHash:
      '0xd29f3d9983f57b67c2c9cfe82b78721c2271fcebc20059f9c4c806e1534f1825',
    blockHint: 'real ETH price returned ($2,310.99)',
    detail: '0.05 mUSDC settled to iNFT #3’s RoyaltyVault',
  },
];

// Pinned addresses (mirror of addresses.json — just for the contracts panel)
const CONTRACTS = [
  {
    label: 'ClawforgerINFT (ERC-7857)',
    addr: '0xfe9163ee0a168e30c10c458c3fadf9f8566647fc',
  },
  {
    label: 'SkillRegistry (TRUSTED_PUBLISHER)',
    addr: '0xdd8b4fbb08327367ddc61aaca5d119d7e5cedb47',
  },
  {
    label: 'mUSDC (settlement asset)',
    addr: '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5',
  },
  {
    label: 'RoyaltyVault template',
    addr: '0xb1bf1fa01840a031d45152cc37bd70d8fef63b0e',
  },
];

export default function Demo() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">live walkthrough</h1>
        <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
          Four steps from mint to verified on-chain settlement. Every action
          here triggers a real transaction; every receipt below is a real
          chainscan link. No simulations.
        </p>
      </div>

      {/* The four steps */}
      <div className="space-y-3">
        <Step
          n={1}
          icon={<Wand2 size={16} />}
          title="Mint a persona"
          subtitle="Pick Researcher / Writer / Trader / Analyst — each becomes an ERC-7857 iNFT with a deterministic signing wallet."
          ctaLabel="open mint"
          ctaTo="/mint"
          accent="text-violet-400"
          previewPersonas
        />

        <Step
          n={2}
          icon={<Sparkles size={16} />}
          title="Watch a producer self-evolve a skill"
          subtitle={
            'Open any producer’s chat (Researcher / Writer / Trader). Type a prompt that requires a capability they don’t have yet. The agent forges new code via DeepSeek V3 on 0G Compute mainnet, sandbox-tests it, encrypts the artifact to 0G Storage, and publishes on-chain via SkillRegistry — in one chat turn.'
          }
          example={
            'Forge a price.token skill that fetches the USD price for any crypto symbol, then call it for ETH.'
          }
          ctaLabel="open agents list"
          ctaTo="/agents"
          accent="text-emerald-400"
        />

        <Step
          n={3}
          icon={<ShoppingCart size={16} />}
          title="Watch an Analyst buy from a producer"
          subtitle={
            'Open the Analyst’s chat. The Analyst persona doesn’t forge — it buys. Its sub-wallet signs a real mUSDC.transfer to the producer’s RoyaltyVault, settlement is verified by tx receipt, then the skill executes and the result returns with a clickable chainscan link.'
          }
          example="Get me the current ETH price."
          ctaLabel="open agents list"
          ctaTo="/agents"
          accent="text-cyan-400"
        />

        <Step
          n={4}
          icon={<Anchor size={16} />}
          title="Verify on-chain"
          subtitle="Every buy lands a real ERC-20 transfer to a per-iNFT vault on 0G Galileo. Receipts below are pinned from verified production runs."
          accent="text-amber-400"
        >
          <div className="space-y-2 mt-3">
            {REAL_RECEIPTS.map((r) => (
              <a
                key={r.txHash}
                href={`${EXPLORER}/tx/${r.txHash}`}
                target="_blank"
                rel="noopener"
                className="block rounded border border-zinc-800 hover:border-accent/60 bg-zinc-900/30 px-3 py-2 transition group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-200 group-hover:text-accent">
                    {r.label}
                  </div>
                  <ExternalLink
                    size={12}
                    className="text-zinc-500 group-hover:text-accent shrink-0"
                  />
                </div>
                <div className="text-[10px] font-mono text-zinc-500 break-all mt-0.5">
                  {r.txHash}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {r.blockHint} · {r.detail}
                </div>
              </a>
            ))}
          </div>
        </Step>
      </div>

      {/* Contracts strip */}
      <div className="card !p-4 space-y-2">
        <div className="text-[11px] uppercase font-mono text-zinc-500 tracking-wider">
          Deployed on 0G Galileo testnet (chainId 16602)
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {CONTRACTS.map((c) => (
            <a
              key={c.addr}
              href={`${EXPLORER}/address/${c.addr}`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-zinc-800 hover:border-accent/60 transition text-xs group"
            >
              <span className="text-zinc-400 truncate">{c.label}</span>
              <span className="font-mono text-zinc-500 group-hover:text-accent shrink-0">
                {c.addr.slice(0, 8)}…{c.addr.slice(-4)}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Operator note */}
      <p className="text-[11px] text-zinc-500 max-w-2xl leading-relaxed">
        Inference runs on 0G Aristotle mainnet (DeepSeek V3, TEE-verified per
        turn). Contracts run on 0G Galileo testnet because Aristotle has no
        canonical USD stablecoin yet — see ARCHITECTURE.md and FEEDBACK.md
        for the full hybrid posture rationale. Every onchain action funnels
        through KeeperHub MCP.
      </p>
    </div>
  );
}

interface StepProps {
  n: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  example?: string;
  ctaLabel?: string;
  ctaTo?: string;
  accent: string;
  previewPersonas?: boolean;
  children?: React.ReactNode;
}

function Step({
  n,
  icon,
  title,
  subtitle,
  example,
  ctaLabel,
  ctaTo,
  accent,
  previewPersonas,
  children,
}: StepProps) {
  return (
    <div className="card flex flex-col md:flex-row md:items-start gap-4">
      <div
        className={`shrink-0 w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center ${accent} font-mono text-sm`}
      >
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={accent}>{icon}</span>
          <h3 className="font-bold text-zinc-100">{title}</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">{subtitle}</p>

        {previewPersonas && (
          <div className="flex gap-2 mt-3">
            {(['Researcher', 'Writer', 'Trader', 'Analyst'] as const).map(
              (name, i) => (
                <div key={name} className="flex flex-col items-center gap-1">
                  <AgentAvatar
                    tokenId={BigInt(i + 1)}
                    name={name}
                    size={36}
                  />
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {name.toLowerCase()}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {example && (
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <div className="text-[10px] uppercase font-mono text-zinc-500 mb-1">
              try this prompt
            </div>
            <code className="text-[12px] text-zinc-300 font-mono">
              {example}
            </code>
          </div>
        )}

        {children}

        {ctaLabel && ctaTo && (
          <Link
            to={ctaTo}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            {ctaLabel} <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

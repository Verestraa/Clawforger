import { Link } from 'react-router';
import { ArrowRight, Zap, Shield, Coins, Brain, Network, Cpu } from 'lucide-react';
import { useChainStats } from '@/hooks/useChainStats';
import { Logo } from '@/components/Logo';
import { SponsorStrip } from '@/components/SponsorStrip';

export default function Landing() {
  const stats = useChainStats();

  return (
    <div className="space-y-24 pb-20">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-20 md:pt-32 text-center space-y-8">
        {/* Glowing claw + anvil mark */}
        <div className="flex justify-center">
          <Logo size={140} glow title="Clawforger mark" />
        </div>

        <div className="space-y-3">
          <h1 className="text-6xl md:text-8xl font-bold leading-[1.05] tracking-tight">
            <span className="text-accent">Claw</span>forger
          </h1>
          <p className="text-xs md:text-sm uppercase tracking-[0.4em] text-zinc-500">
            self-evolving iNFT agents on 0G
          </p>
        </div>

        <p className="text-zinc-400 max-w-2xl mx-auto text-lg leading-relaxed">
          The agent framework where every agent is an{' '}
          <span className="text-accent">ERC-7857 iNFT</span>, every learned skill is a{' '}
          <span className="text-accent">paywalled x402 endpoint</span>, and every onchain action settles through{' '}
          <span className="text-accent">KeeperHub</span>.
        </p>

        <div className="flex justify-center gap-3 pt-2 flex-wrap">
          <Link to="/mint" className="btn btn-primary">
            mint your first agent <ArrowRight size={16} />
          </Link>
          <Link to="/demo" className="btn">
            run live demo
          </Link>
        </div>

        <div className="flex justify-center pt-4">
          <div className="inline-flex pill text-accent border-accent/40">
            <Zap size={12} /> live on 0G Galileo testnet
            {stats.blockHeight !== null && (
              <span className="text-zinc-500 ml-2">block {stats.blockHeight.toLocaleString()}</span>
            )}
          </div>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="agents minted" value={fmtNumber(stats.agentsMinted)} icon={<Brain size={14} />} />
        <Stat label="skills published" value={fmtNumber(stats.skillsPublished)} icon={<Cpu size={14} />} />
        <Stat label="mUSDC settled" value={fmtMUSDC(stats.mUSDCSettled)} icon={<Coins size={14} />} />
      </section>

      {/* ─── Section header ──────────────────────────────────── */}
      <section className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">// what makes it different</p>
        <h2 className="text-3xl md:text-4xl font-bold">four primitives, one stack</h2>
      </section>

      {/* ─── Features ────────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-4">
        <Feature
          icon={<Brain />}
          title="self-evolution"
          body="When an agent fails a task, the LLM generates new tool code, sandbox-tests it, and on success publishes the artifact to 0G Storage. The iNFT metadata updates dynamically (ERC-4906)."
        />
        <Feature
          icon={<Coins />}
          title="x402 skill marketplace"
          body="Every published skill is a paywalled HTTP endpoint. Other agents discover via on-chain SkillRegistry, pay sub-cent mUSDC via x402, and use it. Royalties stream to the iNFT owner via on-chain RoyaltyVault."
        />
        <Feature
          icon={<Shield />}
          title="every tx via KeeperHub"
          body="No package in the framework calls eth_sendRawTransaction. Every onchain action — mint, evolve, settle — compiles to a KeeperHub workflow with retry, gas optimization, and audit trail."
        />
        <Feature
          icon={<Network />}
          title="0G end-to-end"
          body="Inference on 0G Compute (TEE-verified). Memory on 0G Storage (KV + Log, AES-256-GCM client-side encrypted). Identity on 0G Chain (ERC-7857). One stack, no second chain."
        />
      </section>

      {/* ─── Quick Start ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">// quick start</p>
          <h2 className="text-3xl md:text-4xl font-bold">try it locally</h2>
        </div>
        <div className="card max-w-3xl mx-auto bg-zinc-950/80 border-zinc-800/80 font-mono text-sm space-y-1.5">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="text-xs text-zinc-500 ml-2">terminal</span>
          </div>
          <Line prefix="$" cmd="bun install" />
          <Line prefix="$" cmd="bun run contracts:deploy" comment="deploy 4 contracts to 0G Galileo" />
          <Line prefix="$" cmd="bun run examples/researcher/src/index.ts" comment="watch an agent evolve" />
          <Line prefix="$" cmd="bun run studio" comment="open http://localhost:3000" />
        </div>
      </section>

      {/* ─── Sponsor strip ───────────────────────────────────── */}
      <section className="text-center space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">// powered by</p>
        <SponsorStrip />
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card glow-on-hover text-center space-y-2 transition">
      <div className="flex justify-center text-accent">{icon}</div>
      <div className="text-4xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card glow-on-hover space-y-3 transition">
      <div className="text-accent">{icon}</div>
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
    </div>
  );
}

function Line({ prefix, cmd, comment }: { prefix: string; cmd: string; comment?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-accent select-none">{prefix}</span>
      <span className="text-zinc-300">{cmd}</span>
      {comment && <span className="text-zinc-600 text-xs ml-auto"># {comment}</span>}
    </div>
  );
}

function fmtNumber(n: number | null): string {
  if (n === null) return '…';
  return n.toLocaleString();
}

function fmtMUSDC(n: bigint | null): string {
  if (n === null) return '…';
  if (n === 0n) return '0';
  return (Number(n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

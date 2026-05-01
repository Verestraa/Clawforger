import { Link } from 'react-router';
import { ArrowRight, Zap, Shield, Coins, Brain, Network } from 'lucide-react';
import { useChainStats } from '@/hooks/useChainStats';

export default function Landing() {
  const stats = useChainStats();
  return (
    <div className="space-y-16">
      <section className="text-center space-y-6 pt-12">
        <div className="inline-flex pill text-accent border-accent/40">
          <Zap size={12} /> live on 0G Galileo testnet
          {stats.blockHeight !== null && (
            <span className="text-zinc-500 ml-2">block {stats.blockHeight.toLocaleString()}</span>
          )}
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight">
          self-evolving <span className="text-accent">iNFT agents</span>
          <br />
          that earn USDC
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
          The agent framework where every agent is an ERC-7857 iNFT, every learned
          skill is a paywalled x402 endpoint, and every onchain action settles
          through KeeperHub.
        </p>
        <div className="flex justify-center gap-3 pt-4">
          <Link to="/mint" className="btn btn-primary">
            mint your first agent <ArrowRight size={16} />
          </Link>
          <Link to="/demo" className="btn">
            run live demo
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="agents minted" value={fmtNumber(stats.agentsMinted)} />
        <Stat label="skills published" value={fmtNumber(stats.skillsPublished)} />
        <Stat label="mUSDC settled" value={fmtMUSDC(stats.mUSDCSettled)} />
      </section>

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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mt-1">{label}</div>
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

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card space-y-2">
      <div className="text-accent">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-zinc-400">{body}</p>
    </div>
  );
}

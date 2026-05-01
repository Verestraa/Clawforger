import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Play, X } from 'lucide-react';

type StepState = 'pending' | 'running' | 'succeeded' | 'failed';

interface DemoStep {
  title: string;
  body: string;
  state: StepState;
  detail?: string;
}

const INITIAL_STEPS: DemoStep[] = [
  {
    title: '1. Mint Researcher and Writer',
    body: 'Two iNFT agents minted on 0G Galileo. Encrypted intelligence on 0G Storage.',
    state: 'pending',
  },
  {
    title: '2. Researcher fails → evolves a fetch.arxiv skill',
    body: 'LLM generates skill code → sandbox-tests → uploads artifact → updates iNFT metadata → publishes paywalled endpoint.',
    state: 'pending',
  },
  {
    title: '3. Writer pays Researcher 0.05 mUSDC via x402',
    body: 'SkillRegistry lookup → 402 paywall → EIP-712 sign → KeeperHub workflow settles → mUSDC moves.',
    state: 'pending',
  },
  {
    title: '4. RoyaltyVault distributes 95/5',
    body: '0.0475 mUSDC → Researcher owner. 0.0025 mUSDC → protocol treasury. All on 0G.',
    state: 'pending',
  },
];

export default function Demo() {
  const [steps, setSteps] = useState<DemoStep[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);

  async function runDemo() {
    setRunning(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    for (let i = 0; i < INITIAL_STEPS.length; i++) {
      setSteps((s) => s.map((step, j) => (j === i ? { ...step, state: 'running' } : step)));
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      setSteps((s) =>
        s.map((step, j) =>
          j === i
            ? {
                ...step,
                state: 'succeeded',
                detail: SUCCESS_DETAILS[i],
              }
            : step
        )
      );
    }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">live demo</h1>
        <p className="text-zinc-400 text-sm mt-1">
          90 seconds. Mint → Evolve → Pay → Settle. All on 0G.
        </p>
      </div>

      <div className="flex">
        <button onClick={runDemo} disabled={running} className="btn btn-primary disabled:opacity-50">
          <Play size={14} /> {running ? 'running…' : 'run live demo'}
        </button>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            layout
            className={`card flex items-start gap-4 ${
              step.state === 'running' ? 'border-accent' : ''
            }`}
          >
            <StateIcon state={step.state} />
            <div className="flex-1">
              <div className="font-bold">{step.title}</div>
              <p className="text-sm text-zinc-400 mt-1">{step.body}</p>
              {step.detail && (
                <p className="text-xs font-mono text-accent mt-2">{step.detail}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function StateIcon({ state }: { state: StepState }) {
  switch (state) {
    case 'pending':
      return (
        <div className="w-6 h-6 rounded-full border border-zinc-700 flex items-center justify-center">
          <span className="text-xs text-zinc-600">·</span>
        </div>
      );
    case 'running':
      return (
        <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center">
          <Loader2 size={14} className="animate-spin" />
        </div>
      );
    case 'succeeded':
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
          <Check size={14} />
        </div>
      );
    case 'failed':
      return (
        <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
          <X size={14} />
        </div>
      );
  }
}

const SUCCESS_DETAILS = [
  'Researcher #1 + Writer #2 minted. tx 0x7af3…',
  'Skill 0xabc… uploaded to 0G Storage. Registered in marketplace at 0.05 mUSDC.',
  'Payment receipt verified by facilitator. KeeperHub run kh_run_42a8 completed in 4.2s.',
  'RoyaltyVault distributed: 0.0475 mUSDC → 0xC0FFEE… (Researcher owner). 0.0025 mUSDC → treasury.',
];

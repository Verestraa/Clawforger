import { useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

const SAMPLE_PERSONAS = [
  {
    name: 'Researcher',
    prompt:
      'You are Researcher. You find, fetch, and summarize academic literature. When existing skills cannot solve the task, you design a new tool, test it, and publish.',
  },
  {
    name: 'Writer',
    prompt:
      'You are Writer. You compose well-structured prose. You purchase research data from other agents via x402 when you need facts.',
  },
  {
    name: 'Trader',
    prompt:
      'You are Trader. You manage a treasury. You autonomously rebalance via Uniswap when balances drift past targets.',
  },
];

export default function Mint() {
  const { isConnected } = useAccount();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [minting, setMinting] = useState(false);

  async function handleMint() {
    if (!isConnected) {
      toast.error('Connect a wallet first');
      return;
    }
    setMinting(true);
    try {
      // TODO (WAKEUP): wire to @clawforger/inft-identity.mintAgent
      // - encrypt prompt + initial skills
      // - upload to 0G Storage
      // - call ClawforgerINFT.mintAgent
      await new Promise((r) => setTimeout(r, 1500));
      toast.success(`Would mint ${name} (wired post-deploy)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">mint a Clawforger agent</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Encrypts the persona, uploads to 0G Storage, mints an ERC-7857 iNFT to your wallet.
        </p>
      </div>

      <div className="card space-y-5">
        <Field label="name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Researcher"
          />
        </Field>
        <Field label="personality / system prompt">
          <textarea
            className="input min-h-[140px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="You are an autonomous agent that…"
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
                className="pill hover:border-accent"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">est gas: ~0.001 0G</span>
          <button
            onClick={handleMint}
            disabled={!name || !prompt || minting}
            className="btn btn-primary disabled:opacity-50"
          >
            {minting ? 'minting…' : 'mint agent'}
          </button>
        </div>
      </div>
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

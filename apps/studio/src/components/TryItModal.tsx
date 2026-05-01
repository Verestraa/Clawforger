/**
 * TryItModal — pay for a skill with real mUSDC + run it.
 *
 * Two paths exposed:
 *   1. "Pay & Run" — full x402 flow:
 *        balance check → mUSDC.approve(vault) → EIP-712 sign payment →
 *        POST /skill/:hash with X-Payment → server verifies via our
 *        facilitator → server calls vault.settle via KeeperHub →
 *        server returns skill output + settle txHash
 *   2. "For agents" tab — shows the x402 spec curl + paySkillAndCall
 *        snippet, so other AI agents can integrate programmatically
 */

import { useState } from 'react';
import {
  X,
  Coins,
  Play,
  Loader2,
  ExternalLink,
  Check,
  AlertCircle,
  Code2,
  User,
} from 'lucide-react';
import {
  type Address,
  type Hex,
  parseAbi,
  toHex,
} from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ADDRESSES } from '@/lib/contracts';
import { waitForReceipt } from '@/lib/waitTx';

const MARKET_URL =
  (import.meta.env.VITE_X402_MARKET_URL as string | undefined) ?? 'http://localhost:3700';
const EXPLORER = 'https://chainscan-galileo.0g.ai';

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);

export interface TryItSkill {
  hash: Hex;
  capabilityTag: string;
  ownerTokenId: bigint;
  priceUSDC: bigint;
  txHash: Hex;
}

interface Props {
  skill: TryItSkill;
  onClose: () => void;
}

const PRESETS: Record<string, Record<string, string>> = {
  'fetch.arxiv': { paperId: '2604.27264' },
  'text.summarize': { text: 'Clawforger is a self-evolving agent framework on 0G.' },
};

type StepStatus = 'pending' | 'running' | 'done' | 'error';
interface FlowStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

export function TryItModal({ skill, onClose }: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [tab, setTab] = useState<'pay' | 'agents'>('pay');
  const [inputs, setInputs] = useState<Record<string, string>>(
    PRESETS[skill.capabilityTag] ?? { input: '' }
  );
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setStep(idx: number, patch: Partial<FlowStep>) {
    setSteps((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function payAndRun() {
    if (!address || !walletClient || !publicClient) {
      setError('connect a wallet first');
      return;
    }

    setRunning(true);
    setResult(null);
    setError(null);

    const flow: FlowStep[] = [
      { label: 'check mUSDC balance', status: 'pending' },
      { label: 'fetch payment requirements (HTTP 402)', status: 'pending' },
      { label: 'approve mUSDC for the agent vault', status: 'pending' },
      { label: 'sign EIP-712 payment authorization', status: 'pending' },
      { label: 'POST /skill — server verifies + KeeperHub settles', status: 'pending' },
    ];
    setSteps(flow);

    try {
      // ── 1. Balance check ──────────────────────────────────────────
      setStep(0, { status: 'running' });
      const balance = (await publicClient.readContract({
        address: ADDRESSES.mUSDC as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint;
      if (balance < skill.priceUSDC) {
        setStep(0, {
          status: 'error',
          detail: `have ${fmtMUSDC(balance)}, need ${fmtMUSDC(skill.priceUSDC)} mUSDC`,
        });
        throw new Error('insufficient mUSDC — click "+10k" in the header to mint some');
      }
      setStep(0, { status: 'done', detail: `balance: ${fmtMUSDC(balance)} mUSDC ✓` });

      // ── 2. Probe for 402 ──────────────────────────────────────────
      setStep(1, { status: 'running' });
      const probe = await fetch(`${MARKET_URL}/skill/${skill.hash}`, { method: 'GET' });
      if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}`);
      const requirements = await probe.json();
      const accept = requirements.accepts[0];
      if (!accept) throw new Error('no payment requirements returned');
      const vault = accept.payTo as Address;
      const asset = accept.asset as Address;
      const amount = BigInt(accept.maxAmountRequired);
      setStep(1, {
        status: 'done',
        detail: `pay ${fmtMUSDC(amount)} mUSDC to ${shortAddr(vault)}`,
      });

      // ── 3. Approve ────────────────────────────────────────────────
      setStep(2, { status: 'running' });
      const allowance = (await publicClient.readContract({
        address: asset,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, vault],
      })) as bigint;
      let approveTxHash: Hex | undefined;
      if (allowance < amount) {
        const { request } = await publicClient.simulateContract({
          address: asset,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [vault, amount],
          account: address,
        });
        approveTxHash = await walletClient.writeContract(request);
        // 0G public RPC sometimes lags receipt indexing; use our resilient poller
        await waitForReceipt(publicClient, approveTxHash, { timeoutMs: 180_000 });
        setStep(2, { status: 'done', detail: `tx ${approveTxHash.slice(0, 10)}…` });
      } else {
        setStep(2, { status: 'done', detail: 'already approved ✓' });
      }

      // ── 4. EIP-712 sign ───────────────────────────────────────────
      setStep(3, { status: 'running' });
      const validUntil = Math.floor(Date.now() / 1000) + (accept.maxTimeoutSeconds ?? 120);
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
      const message = {
        payer: address,
        payTo: vault,
        asset,
        amount,
        validUntil: BigInt(validUntil),
        nonce,
      };
      const signature = await walletClient.signTypedData({
        account: address,
        domain: { name: 'Clawforger x402', version: '1', chainId: 16602 },
        types: {
          Payment: [
            { name: 'payer', type: 'address' },
            { name: 'payTo', type: 'address' },
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'validUntil', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        primaryType: 'Payment',
        message,
      });
      setStep(3, { status: 'done', detail: 'signed ✓' });

      // ── 5. POST with X-Payment ────────────────────────────────────
      setStep(4, { status: 'running' });
      const paymentPayload = {
        scheme: 'exact',
        network: '0g-galileo-testnet',
        payer: address,
        payTo: vault,
        asset,
        amount: amount.toString(),
        validUntil,
        nonce,
        signature,
      };
      const paid = await fetch(`${MARKET_URL}/skill/${skill.hash}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment': JSON.stringify(paymentPayload),
        },
        body: JSON.stringify(inputs),
      });
      const paidJson = await paid.json();
      if (!paid.ok) {
        setStep(4, {
          status: 'error',
          detail: paidJson.reason ?? paidJson.error ?? `HTTP ${paid.status}`,
        });
        throw new Error(paidJson.reason ?? paidJson.error ?? 'paid call failed');
      }
      const settleTx = paidJson.settlement?.txHash as Hex | undefined;
      const settleRoute = paidJson.settlement?.route as 'keeperhub' | 'viem-fallback' | undefined;
      setStep(4, {
        status: 'done',
        detail: settleTx
          ? `settled via ${settleRoute} · tx ${settleTx.slice(0, 10)}…`
          : 'settled (no tx returned)',
      });

      setResult({ ...paidJson, _approveTx: approveTxHash, _settleTx: settleTx });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

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
            <div className="text-xs text-zinc-500 uppercase tracking-widest">try a skill</div>
            <h3 className="text-2xl font-bold mt-1">{skill.capabilityTag}</h3>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-500">
              <span>
                from <span className="text-zinc-300">Agent #{String(skill.ownerTokenId)}</span>
              </span>
              <span className="flex items-center gap-1 text-accent">
                <Coins size={11} /> {fmtMUSDC(skill.priceUSDC)} mUSDC
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        {/* tabs */}
        <div className="border-b border-zinc-800 flex gap-1 mt-5 -mb-px">
          <TabBtn active={tab === 'pay'} onClick={() => setTab('pay')} icon={<User size={13} />}>
            for humans (pay & run)
          </TabBtn>
          <TabBtn
            active={tab === 'agents'}
            onClick={() => setTab('agents')}
            icon={<Code2 size={13} />}
          >
            for agents (x402)
          </TabBtn>
        </div>

        {tab === 'pay' && (
          <PayTab
            skill={skill}
            inputs={inputs}
            setInputs={setInputs}
            running={running}
            steps={steps}
            result={result}
            error={error}
            onRun={payAndRun}
          />
        )}

        {tab === 'agents' && <AgentsTab skill={skill} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────────────────────────

function PayTab({
  skill,
  inputs,
  setInputs,
  running,
  steps,
  result,
  error,
  onRun,
}: {
  skill: TryItSkill;
  inputs: Record<string, string>;
  setInputs: (v: Record<string, string>) => void;
  running: boolean;
  steps: FlowStep[];
  result: any | null;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <div className="pt-5 space-y-5">
      <div className="space-y-3">
        <div className="text-xs text-zinc-400 uppercase tracking-wider">inputs</div>
        {Object.keys(inputs).length === 0 ? (
          <div className="text-xs text-zinc-500">no inputs required</div>
        ) : (
          Object.entries(inputs).map(([key, value]) => (
            <div key={key}>
              <label className="text-xs text-zinc-500 mb-1 block">{key}</label>
              <input
                className="input"
                value={value}
                onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                disabled={running}
              />
            </div>
          ))
        )}
      </div>

      {steps.length > 0 && (
        <div className="card !p-3 space-y-1.5 bg-zinc-950/60">
          {steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
        </div>
      )}

      {error && (
        <div className="card bg-red-950/40 border-red-900/50 text-sm text-red-300">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertCircle size={14} /> error
          </div>
          <pre className="text-xs whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <Check size={14} /> skill returned · paid {fmtMUSDC(skill.priceUSDC)} mUSDC
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {result._approveTx && (
              <a
                href={`${EXPLORER}/tx/${result._approveTx}`}
                target="_blank"
                rel="noopener"
                className="text-zinc-500 hover:text-accent flex items-center gap-1"
              >
                approve tx <ExternalLink size={11} />
              </a>
            )}
            {result._settleTx && (
              <a
                href={`${EXPLORER}/tx/${result._settleTx}`}
                target="_blank"
                rel="noopener"
                className="text-zinc-500 hover:text-accent flex items-center gap-1"
              >
                settlement tx <ExternalLink size={11} />
              </a>
            )}
          </div>
          <pre className="card text-xs font-mono overflow-auto max-h-64 bg-zinc-950/80">
            {JSON.stringify(result.output, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">
          x402 paid path · settles via KeeperHub workflow
        </span>
        <button onClick={onRun} disabled={running} className="btn btn-primary disabled:opacity-50">
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" /> running…
            </>
          ) : (
            <>
              <Play size={14} /> pay {fmtMUSDC(skill.priceUSDC)} mUSDC & run
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function AgentsTab({ skill }: { skill: TryItSkill }) {
  const curl = `# 1. Probe — get x402 payment requirements
curl -i ${MARKET_URL}/skill/${skill.hash}
# → HTTP 402 + accepts: [{ payTo, asset, maxAmountRequired, ... }]

# 2. Sign an EIP-712 Payment authorization with your wallet
#    (Domain: Clawforger x402 v1, chainId 16602)
#    Required fields: payer, payTo, asset, amount, validUntil, nonce

# 3. Replay the request with the signed payment in the X-Payment header
curl -X POST ${MARKET_URL}/skill/${skill.hash} \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: $(cat payment.json)" \\
  -d '{ "paperId": "2604.27264" }'
# → 200 with { output, paymentReceipt, settlement: { txHash, route } }`;

  const tsSnippet = `import { paySkillAndCall } from '@clawforger/x402-skill-market/client';

const result = await paySkillAndCall({
  marketUrl: '${MARKET_URL}',
  skill,                  // SkillManifest from on-chain SkillRegistry
  inputs: { paperId: '...' },
  signer: walletClient,   // viem WalletClient
  mUSDCAddress: '${ADDRESSES.mUSDC}',
});

console.log(result.output);`;

  return (
    <div className="pt-5 space-y-5">
      <div className="text-sm text-zinc-400">
        Other AI agents call this skill via the x402 spec. Three steps, no API
        key, sub-cent USDC. Settlement runs through KeeperHub.
      </div>

      <Section title="raw HTTP (any language)">
        <CodeBlock code={curl} />
      </Section>

      <Section title="TypeScript (using our x402 client)">
        <CodeBlock code={tsSnippet} />
      </Section>

      <Section title="payment requirements">
        <div className="space-y-1 text-xs font-mono">
          <Row k="resource" v={`${MARKET_URL}/skill/${skill.hash}`} />
          <Row k="asset" v={ADDRESSES.mUSDC} />
          <Row k="network" v="0g-galileo-testnet (chainId 16602)" />
          <Row k="amount" v={`${fmtMUSDC(skill.priceUSDC)} mUSDC`} />
          <Row k="domain.name" v="Clawforger x402" />
          <Row k="domain.version" v="1" />
        </div>
      </Section>

      <div className="text-[10px] text-zinc-600 pt-3 border-t border-zinc-800">
        x402 spec: https://www.x402.org/ · facilitator runs on :3701 · first 0G
        x402 facilitator (no public one exists for 0G yet)
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Atoms
// ──────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs flex items-center gap-1.5 transition border-b-2 ${
        active
          ? 'border-accent text-zinc-100'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StepRow({ step }: { step: FlowStep }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <StatusDot status={step.status} />
      <span
        className={
          step.status === 'done'
            ? 'text-zinc-300'
            : step.status === 'error'
              ? 'text-red-300'
              : 'text-zinc-500'
        }
      >
        {step.label}
      </span>
      {step.detail && (
        <span
          className={`ml-auto font-mono text-[10px] ${
            step.status === 'error' ? 'text-red-400' : 'text-accent'
          }`}
        >
          {step.detail}
        </span>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === 'done')
    return <Check size={14} className="text-emerald-500 flex-shrink-0" />;
  if (status === 'running')
    return <Loader2 size={14} className="text-accent animate-spin flex-shrink-0" />;
  if (status === 'error')
    return <AlertCircle size={14} className="text-red-500 flex-shrink-0" />;
  return <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 flex-shrink-0" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{title}</div>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="card text-xs font-mono overflow-auto bg-zinc-950/80 whitespace-pre">
      {code}
    </pre>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-zinc-400">
      <span className="text-zinc-500">{k}</span>
      <span className="text-zinc-300 truncate">{v}</span>
    </div>
  );
}

function fmtMUSDC(units: bigint): string {
  if (units === 0n) return '0';
  const whole = units / 1_000_000n;
  const fraction = units % 1_000_000n;
  if (fraction === 0n) return whole.toLocaleString();
  return (Number(whole) + Number(fraction) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

import { useParams } from 'react-router';
import { useState } from 'react';
import { Brain, Sparkles, History, Coins } from 'lucide-react';

const TABS = ['overview', 'skills', 'evolution', 'memory log'] as const;

export default function AgentDetail() {
  const { tokenId } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-accent/10 p-4 text-accent">
          <Brain size={32} />
        </div>
        <div className="flex-1">
          <div className="text-xs text-zinc-500">agent #{tokenId}</div>
          <h1 className="text-3xl font-bold">Researcher</h1>
          <div className="flex gap-2 mt-2">
            <span className="pill">
              <Sparkles size={10} /> 1 skill
            </span>
            <span className="pill">
              <Coins size={10} /> 0.05 mUSDC earned
            </span>
            <span className="pill">
              <History size={10} /> evolved 1×
            </span>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition ${
              tab === t
                ? 'border-b-2 border-accent text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-[300px]">
        {tab === 'overview' && <Overview />}
        {tab === 'skills' && <Skills />}
        {tab === 'evolution' && <Evolution />}
        {tab === 'memory log' && <MemoryLog />}
      </div>
    </div>
  );
}

function Overview() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card space-y-2">
        <div className="text-xs text-zinc-500 uppercase">intelligence hash</div>
        <div className="text-xs font-mono break-all text-zinc-300">og-storage://abc123…</div>
      </div>
      <div className="card space-y-2">
        <div className="text-xs text-zinc-500 uppercase">royalty vault</div>
        <div className="text-xs font-mono break-all text-zinc-300">0x0000…0000</div>
      </div>
      <div className="card space-y-2 md:col-span-2">
        <div className="text-xs text-zinc-500 uppercase">personality</div>
        <p className="text-sm text-zinc-300">
          You are Researcher. You find, fetch, and summarize academic literature.
        </p>
      </div>
    </div>
  );
}

function Skills() {
  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between">
        <div>
          <div className="font-bold">fetch.arxiv</div>
          <div className="text-xs text-zinc-500">0xabc123…</div>
        </div>
        <div className="text-right">
          <div className="text-accent font-bold">0.05 mUSDC</div>
          <div className="text-xs text-zinc-500">used 1×</div>
        </div>
      </div>
    </div>
  );
}

function Evolution() {
  const events = [
    { ts: '2026-05-02 02:14', kind: 'evolved', detail: 'gained skill fetch.arxiv' },
    { ts: '2026-05-02 02:05', kind: 'minted', detail: 'agent born' },
  ];
  return (
    <div className="space-y-1">
      {events.map((e, i) => (
        <div key={i} className="card py-3 flex items-center gap-4 text-sm">
          <div className="text-zinc-500 w-32">{e.ts}</div>
          <div className="pill">{e.kind}</div>
          <div className="text-zinc-300">{e.detail}</div>
        </div>
      ))}
    </div>
  );
}

function MemoryLog() {
  return (
    <div className="card">
      <p className="text-zinc-500 text-sm">No log entries yet — run a task to populate memory.</p>
    </div>
  );
}

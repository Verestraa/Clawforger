import { useState } from 'react';
import { Search, Coins, Play } from 'lucide-react';

const MOCK_SKILLS = [
  {
    hash: '0xabc123',
    capabilityTag: 'fetch.arxiv',
    owner: 'Researcher #1',
    price: 0.05,
    useCount: 12,
  },
  {
    hash: '0xdef456',
    capabilityTag: 'text.summarize',
    owner: 'Writer #2',
    price: 0.02,
    useCount: 7,
  },
];

export default function Market() {
  const [query, setQuery] = useState('');

  const filtered = MOCK_SKILLS.filter((s) =>
    s.capabilityTag.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">skill marketplace</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Skills published by Clawforger agents. Each call is a sub-cent x402 payment.
        </p>
      </div>

      <div className="card flex items-center gap-3">
        <Search size={16} className="text-zinc-500" />
        <input
          className="bg-transparent flex-1 outline-none text-sm"
          placeholder="search by capability tag (e.g. fetch.arxiv)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {filtered.map((s) => (
          <div key={s.hash} className="card flex items-center gap-4">
            <div className="flex-1">
              <div className="font-bold">{s.capabilityTag}</div>
              <div className="text-xs text-zinc-500 mt-1">
                from {s.owner} · used {s.useCount}×
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-accent font-bold">
                <Coins size={14} /> {s.price} mUSDC
              </div>
            </div>
            <button className="btn">
              <Play size={14} /> try it
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center text-zinc-500 text-sm">
            No skills match "{query}". Mint an agent and watch it evolve →
          </div>
        )}
      </div>
    </div>
  );
}

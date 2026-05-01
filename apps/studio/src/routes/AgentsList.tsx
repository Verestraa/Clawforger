import { Link } from 'react-router';
import { Brain } from 'lucide-react';

const MOCK_AGENTS = [
  { tokenId: 1, name: 'Researcher', skills: 1, evolutions: 1 },
  { tokenId: 2, name: 'Writer', skills: 0, evolutions: 0 },
];

export default function AgentsList() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">your agents</h1>
        <p className="text-zinc-400 text-sm mt-1">
          iNFT agents owned by your connected wallet.
        </p>
      </div>

      {MOCK_AGENTS.length === 0 ? (
        <div className="card text-center text-zinc-500">
          No agents minted yet. <Link to="/mint" className="text-accent">Mint one →</Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {MOCK_AGENTS.map((a) => (
            <Link
              key={a.tokenId}
              to={`/agents/${a.tokenId}`}
              className="card hover:border-accent transition flex items-start gap-4"
            >
              <div className="rounded-lg bg-accent/10 p-3 text-accent">
                <Brain />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-lg">{a.name}</h3>
                  <span className="text-xs text-zinc-500">#{a.tokenId}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-1 flex gap-3">
                  <span>{a.skills} skills</span>
                  <span>{a.evolutions} evolutions</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

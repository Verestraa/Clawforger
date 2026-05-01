import { Outlet, Link, useLocation } from 'react-router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { MintMUSDC } from './components/MintMUSDC';

const NAV = [
  { to: '/', label: 'home' },
  { to: '/mint', label: 'mint' },
  { to: '/agents', label: 'agents' },
  { to: '/market', label: 'market' },
  { to: '/demo', label: 'demo' },
];

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900/60 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/70 backdrop-blur-md z-10">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-bold tracking-tight text-lg flex items-center gap-2">
            <span className="text-xl">🦞</span>
            <span><span className="text-accent">claw</span>forger</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded-md transition ${
                  pathname === n.to
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <MintMUSDC />
          <ConnectButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-900 px-6 py-4 text-xs text-zinc-500 flex justify-between">
        <div>
          all-in on{' '}
          <a className="text-accent" href="https://0g.ai" target="_blank" rel="noopener">
            0G
          </a>{' '}
          · execution on{' '}
          <a className="text-accent" href="https://keeperhub.com" target="_blank" rel="noopener">
            KeeperHub
          </a>{' '}
          · payments via{' '}
          <a className="text-accent" href="https://x402.org" target="_blank" rel="noopener">
            x402
          </a>
        </div>
        <div>
          <a className="hover:text-accent" href="https://github.com/ClawForger/clawforger" target="_blank" rel="noopener">
            github
          </a>
        </div>
      </footer>
    </div>
  );
}

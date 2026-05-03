import { Outlet, Link, useLocation } from 'react-router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { MintMUSDC } from './components/MintMUSDC';
import { Logo } from './components/Logo';

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
    <div className="content-root min-h-screen flex flex-col">
      <header className="border-b border-zinc-900/60 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/70 backdrop-blur-md z-10">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-bold tracking-tight text-lg flex items-center gap-2.5">
            <Logo size={28} />
            <span><span className="text-accent">claw</span>forger</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => {
              const active =
                n.to === '/'
                  ? pathname === '/'
                  : pathname === n.to || pathname.startsWith(n.to + '/');
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`relative px-3 py-1.5 transition ${
                    active
                      ? 'text-zinc-100'
                      : 'text-zinc-300 hover:text-zinc-100'
                  }`}
                >
                  {n.label}
                  {active && (
                    <span className="absolute -bottom-[18px] left-2 right-2 h-0.5 rounded-full bg-accent shadow-[0_0_12px_rgba(183,95,255,0.6)]" />
                  )}
                </Link>
              );
            })}
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
      <footer className="border-t border-zinc-900 px-6 py-4 text-xs text-zinc-400 flex justify-between">
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
        <div className="flex items-center gap-3">
          <a
            className="hover:text-accent"
            href="https://x.com/verestraa"
            target="_blank"
            rel="noopener"
            title="follow on X"
          >
            @verestraa
          </a>
          <span className="text-zinc-700">·</span>
          <a
            className="hover:text-accent"
            href="https://github.com/Verestraa/Clawforger"
            target="_blank"
            rel="noopener"
          >
            github
          </a>
        </div>
      </footer>
    </div>
  );
}

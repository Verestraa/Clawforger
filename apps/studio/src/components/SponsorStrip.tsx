/**
 * SponsorStrip — official logo lockup for 0G + KeeperHub + x402.
 * Logos sourced from each project's official brand kit / hosted assets.
 * All rendered at uniform height for visual rhythm; muted by default,
 * brightens on hover to draw clicks to each sponsor's site.
 */

const SPONSORS: Array<{
  name: string;
  url: string;
  src: string;
  /** Tailwind height class — keeps a uniform optical baseline */
  hClass: string;
  /** Specific tweak: KeeperHub PNG is portrait-tall, needs height adjust */
  alt: string;
}> = [
  {
    name: '0G',
    url: 'https://0g.ai',
    src: '/sponsors/0g-logo-white.svg',
    hClass: 'h-7 md:h-8',
    alt: '0G — the intelligent Layer 1 for onchain AI',
  },
  {
    name: 'KeeperHub',
    url: 'https://keeperhub.com',
    src: '/sponsors/keeperhub.png',
    hClass: 'h-9 md:h-10',
    alt: 'KeeperHub — execution layer for onchain agents',
  },
  {
    name: 'x402',
    url: 'https://x402.org',
    src: '/sponsors/x402.svg',
    hClass: 'h-5 md:h-6',
    alt: 'x402 — internet-native payments standard',
  },
];

export function SponsorStrip() {
  return (
    <div className="flex justify-center items-center gap-10 md:gap-14 flex-wrap py-2">
      {SPONSORS.map((s) => (
        <a
          key={s.name}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={s.alt}
          className="opacity-50 hover:opacity-100 transition-opacity duration-200"
        >
          <img
            src={s.src}
            alt={s.alt}
            className={`${s.hClass} w-auto select-none`}
            draggable={false}
          />
        </a>
      ))}
    </div>
  );
}

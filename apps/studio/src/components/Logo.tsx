/**
 * The Clawforger mark — geometric claw + anvil + ember.
 * Design system: Clawforger Brand v0.1 (palette #050810 / #F97316 / #F0F4FF / #7C2D12).
 *
 * Two variants:
 *   <Logo />           — full mark with all detail (use ≥ 32px)
 *   <Logo size={20} />  — auto-switches to the simplified favicon mark below 32px
 *
 * Pass `mono` for white-on-dark single-ink contexts.
 * Pass `glow` to render with a radial-orange backdrop (hero use).
 */

interface LogoProps {
  size?: number;
  mono?: boolean;
  glow?: boolean;
  className?: string;
  title?: string;
}

const ACCENT = '#B75FFF';
const ANVIL = '#581C87';
const FG = '#F0F4FF';

export function Logo({ size = 32, mono = false, glow = false, className, title }: LogoProps) {
  const claw = mono ? FG : FG;
  const anvil = mono ? FG : ANVIL;
  const ember = mono ? FG : ACCENT;
  const eye = mono ? FG : ACCENT;

  // Use simplified mark below ~32px
  if (size < 32) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className={className}
        role="img"
        aria-label={title ?? 'Clawforger'}
      >
        <rect x="3" y="19" width="26" height="4" rx="1" fill={claw} />
        <path d="M6 23 L26 23 L24 28 L8 28 Z" fill={anvil} />
        <path d="M4 19 Q4 7 16 5 Q28 7 28 19 L24 19 Q24 11 16 9 Q8 11 8 19 Z" fill={claw} />
        <path d="M27.5 17 L30 15 L29 20 Z" fill={ember} />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={glow ? `glow-lobster ${className ?? ''}` : className}
      role="img"
      aria-label={title ?? 'Clawforger'}
    >
      {/* anvil base (deeper orange, structural shadow) */}
      <path d="M36 138 L164 138 L156 158 L44 158 Z" fill={anvil} />
      {/* anvil top slab (lower jaw) */}
      <path
        d="M28 118 L184 118 Q188 118 188 122 L188 130 Q188 134 184 134 L32 134 Q28 134 28 130 Z"
        fill={claw}
      />
      {/* claw upper jaw */}
      <path
        d="M32 118 Q32 56 100 44 Q168 56 168 118 L152 118 Q152 72 100 62 Q48 72 48 118 Z"
        fill={claw}
      />
      {/* pincer tip bite */}
      <path d="M152 118 L168 118 L168 100 Z" fill={claw} />
      {/* eye dot */}
      <circle cx="74" cy="92" r="5" fill={eye} />
      {/* ember spark */}
      <path d="M178 108 L188 100 L184 116 Z" fill={ember} />
    </svg>
  );
}

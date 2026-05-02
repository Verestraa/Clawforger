/**
 * AgentAvatar — deterministic per-tokenId avatar.
 *
 * Color gradient is derived from the tokenId so every agent has a unique
 * stable visual identity. Persona-aware icon overlays sit on top
 * (Researcher / Writer / Trader / generic).
 */

import { Brain, FileText, TrendingUp, Search, Bot } from 'lucide-react';

interface AgentAvatarProps {
  tokenId: bigint | string | number;
  name?: string;
  size?: number;
}

// Persona name → tailwind from/to gradient class. Keep these consistent
// across the app so users learn "purple = researcher, amber = writer, …"
const PERSONA_GRADIENTS: Record<string, { from: string; to: string }> = {
  Researcher: { from: 'from-violet-500', to: 'to-fuchsia-600' },
  Writer: { from: 'from-amber-500', to: 'to-rose-500' },
  Trader: { from: 'from-emerald-500', to: 'to-teal-600' },
  // Analyst is a CONSUMER — cool blue palette signals "different role"
  // (buyer, not producer) so the marketplace mental model is legible
  // at a glance.
  Analyst: { from: 'from-cyan-500', to: 'to-blue-600' },
};

const PERSONA_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Researcher: Brain,
  Writer: FileText,
  Trader: TrendingUp,
  Analyst: Search,
};

/**
 * Single source of persona styling for the studio. Imported by AgentCard,
 * AgentDetail, and AgentChat so all three pages share one visual language.
 */
export const PERSONA_TONE: Record<string, string> = {
  Researcher: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Writer: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Trader: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Analyst: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
};

export const PERSONA_SCOPE: Record<string, string> = {
  Researcher: 'academic literature',
  Writer: 'prose composition',
  Trader: 'market data',
  Analyst: 'consumer — buys data from other agents',
};

// 8 fallback gradient pairs for non-persona agents — pick by tokenId hash
const FALLBACK_GRADIENTS = [
  { from: 'from-cyan-500', to: 'to-blue-600' },
  { from: 'from-pink-500', to: 'to-purple-600' },
  { from: 'from-lime-500', to: 'to-green-600' },
  { from: 'from-orange-500', to: 'to-red-600' },
  { from: 'from-indigo-500', to: 'to-violet-600' },
  { from: 'from-yellow-500', to: 'to-amber-600' },
  { from: 'from-sky-500', to: 'to-cyan-600' },
  { from: 'from-fuchsia-500', to: 'to-pink-600' },
] as const;

function pickFallbackGradient(tokenId: bigint | string | number) {
  const n = Number(BigInt(tokenId) % BigInt(FALLBACK_GRADIENTS.length));
  return FALLBACK_GRADIENTS[n] ?? FALLBACK_GRADIENTS[0];
}

export function AgentAvatar({ tokenId, name, size = 56 }: AgentAvatarProps) {
  const persona = name && PERSONA_GRADIENTS[name] ? name : null;
  const gradient = persona
    ? PERSONA_GRADIENTS[persona]!
    : pickFallbackGradient(tokenId);
  const Icon = persona && PERSONA_ICONS[persona] ? PERSONA_ICONS[persona]! : Bot;

  // Build the gradient class string explicitly so Tailwind's JIT picks
  // up both halves at build time.
  const gradientClass = `bg-gradient-to-br ${gradient.from} ${gradient.to}`;

  return (
    <div
      className={`${gradientClass} rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/10 relative overflow-hidden flex-shrink-0`}
      style={{ width: size, height: size }}
    >
      {/* Subtle sheen for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      <Icon size={Math.floor(size * 0.5)} />
      {/* tokenId label in corner */}
      <span
        className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[8px] font-mono bg-black/40 backdrop-blur-sm rounded-tl-md"
        style={{ fontSize: Math.max(7, Math.floor(size * 0.14)) }}
      >
        #{String(tokenId)}
      </span>
    </div>
  );
}

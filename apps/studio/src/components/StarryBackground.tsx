/**
 * StarryBackground — fixed-position decorative star field that lives behind
 * everything else. Pure CSS via box-shadow, no JS animation cost. Three
 * layers for parallax depth.
 */
export function StarryBackground() {
  return (
    <div className="starry-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="stars stars-small" />
      <div className="stars stars-medium" />
      <div className="stars stars-large" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-950/60" />
      <div className="orange-glow" />
    </div>
  );
}

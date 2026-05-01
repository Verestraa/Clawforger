/**
 * StarryBackground — fixed-position decorative star field that lives behind
 * everything else. OpenClaw-inspired: single tiled radial-gradient layer
 * (350×200 tile) plus a slower far-layer (700×400) for depth. No JS cost,
 * GPU-accelerated.
 *
 * To layer correctly:
 *   - this <div> is `position: fixed; z-index: 0`
 *   - body is `background: transparent` (see styles.css)
 *   - the rest of the app must sit inside `.content-root` (z-index: 1)
 */
export function StarryBackground() {
  return (
    <div className="starry-root">
      <div className="stars" />
      <div className="stars stars-far" />
    </div>
  );
}

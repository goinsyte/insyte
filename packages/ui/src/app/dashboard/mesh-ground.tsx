/** The brand's ground, as /login draws it: the Abyss stripe mesh, an arc and a sky glow, the dot grid. */
export function MeshGround() {
  return (
    <>
      <div
        className="glow-orb glow-orb--arc anim-orb-drift"
        style={{ width: 560, height: 560, top: -260, left: -120, opacity: 0.95 }}
        aria-hidden
      />
      <div
        className="glow-orb glow-orb--sky anim-orb-drift-slow"
        style={{ width: 460, height: 460, bottom: -220, right: -100, opacity: 0.65 }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 -z-0 bg-dot-grid opacity-30" aria-hidden />
    </>
  )
}

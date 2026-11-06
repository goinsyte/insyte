import { type ReactNode, useRef } from "react"
import { cn } from "../../../lib/utils.ts"
import { useRunning } from "../hooks.ts"

export type Tone = "dark" | "light"

/**
 * The layer every background variant draws into: absolutely filling the hero, `aria-hidden`, and
 * carrying `data-run`, which is false off screen and in a hidden tab so the variant's CSS
 * animations pause (the `.variant-anim` rules in landing.css). Reduced motion stops them in CSS.
 */
export function Layer(
  { children, className }: { readonly children: ReactNode; readonly className?: string }
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const run = useRunning(ref, 0.05)
  return (
    <div
      ref={ref}
      aria-hidden
      data-run={run}
      className={cn("variant-layer pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {children}
    </div>
  )
}

/** Chalk on abyss, ink on light, at a given strength in percent. */
export const stroke = (tone: Tone, pct: number) =>
  `color-mix(in oklch, var(${tone === "dark" ? "--mesh-ink" : "--ink"}) ${pct}%, transparent)`

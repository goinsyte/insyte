import { Link } from "@tanstack/react-router"
import { useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import type { PulseFigure } from "../lib/home/pulse"
import { cn } from "../lib/utils"

/** The band itself, over figures already worked out: the demo's from its history, the console's from `Home.widgets`. */
export function PulseBand({ figures }: { figures: ReadonlyArray<PulseFigure> }) {
  const p = useEntrance(900)

  return (
    <section aria-label="Polsslag" className="@container">
      <div className={cn("grid grid-cols-2 overflow-hidden rounded-xl bg-paper", COLS[figures.length] ?? COLS[6])}>
        {figures.map((f) => <Figure key={f.id} f={f} p={p} />)}
      </div>
    </section>
  )
}

/* Written out for Tailwind: the band keeps one row on a wide board however many figures the role may read. */
export const COLS: Record<number, string> = {
  1: "@lg:grid-cols-1",
  2: "@lg:grid-cols-2",
  3: "@lg:grid-cols-3",
  4: "@lg:grid-cols-4",
  5: "@lg:grid-cols-3 @4xl:grid-cols-5",
  6: "@lg:grid-cols-3 @4xl:grid-cols-6"
}

export function Figure({ f, p }: { f: PulseFigure; p: number }) {
  const good = f.delta?.good
  return (
    <Link
      to={f.to}
      title={f.detail}
      className="group/pulse flex min-w-0 flex-col gap-1 px-4 py-3 transition-colors hover:bg-ink/[0.035]"
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2 group-hover/pulse:text-ink">{f.label}</span>
        {f.delta ?
          (
            <span
              className={cn(
                "shrink-0 rounded-sm px-1 font-medium text-xs tabular-nums",
                good === true
                  ? "bg-signal-green-bg text-signal-green"
                  : good === false
                  ? "bg-signal-red-bg text-signal-red"
                  : "bg-ink/6 text-ink-2"
              )}
            >
              {f.delta.text}
            </span>
          ) :
          null}
      </span>
      <span className="flex items-end justify-between gap-3">
        <data value={f.value} className="font-medium text-xl text-ink tabular-nums">
          {f.format(f.value * p)}
        </data>
        <Spark values={f.spark} />
      </span>
      <span className="sr-only">{f.detail}</span>
    </Link>
  )
}

/** The window's shape in 44×20: one line in `arc`, its last point a dot. Not a chart, a contour. */
export function Spark({ values }: { values: ReadonlyArray<number> }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <span className="h-5 w-11 shrink-0" aria-hidden />
  const w = 44
  const h = 20
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) =>
    [(i / (values.length - 1)) * (w - 3) + 1.5, h - 2 - ((v - min) / span) * (h - 4)] as const
  )
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const last = pts[pts.length - 1]!
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="mb-1 shrink-0" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="var(--arc)"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--arc)" />
    </svg>
  )
}

/** 0 to 1 once, on an out-expo curve, the first time the home is drawn. Reduced motion starts at 1. */
export function useEntrance(ms: number) {
  const still = useReducedMotion()
  const [p, setP] = useState(still ? 1 : 0)
  useEffect(() => {
    if (still) {
      setP(1)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      setP(k === 1 ? 1 : 1 - 2 ** (-10 * k))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [still, ms])
  return p
}

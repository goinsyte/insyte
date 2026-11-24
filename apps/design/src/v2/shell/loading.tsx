import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useRoute } from "../router.tsx"
import { holdLoading } from "../view.ts"
import { useShellState } from "./shell-state.ts"
import { workspaceOf } from "./workspaces.ts"

/*
 * How the reference arrives. It has no network, so everything is on screen the moment the route
 * matches, which hides every loading state the product will have. This puts them back on the
 * schedule the real stack keeps: a cold start shows the workspace once while the session resolves, a
 * navigation draws a thin line across the top of the work, and a page's first visit in a session
 * shows its own skeleton for a moment (`holdLoading` in `view.ts`); a second visit is instant, as
 * from a cache. `?laden=traag` slows it all down to see each step, `?laden=direct` turns it off.
 */

export type Pace = "live" | "traag" | "direct"

export const PACES: ReadonlyArray<{ readonly id: Pace; readonly label: string; readonly detail: string }> = [
  { id: "live", label: "Zoals live", detail: "Eerste bezoek laadt kort, daarna direct" },
  { id: "traag", label: "Traag netwerk", detail: "Alles ruim twee keer zo lang, om elke stap te zien" },
  { id: "direct", label: "Direct", detail: "Geen laadtijd: alles staat er meteen" }
]

const FACTOR: Readonly<Record<Pace, number>> = { live: 1, traag: 2.6, direct: 0 }
const KEY = "insyte:v2:pace"
const isPace = (x: unknown): x is Pace => x === "live" || x === "traag" || x === "direct"

function initialPace(): Pace {
  try {
    const asked = new URLSearchParams(window.location.search).get("laden")
    if (isPace(asked)) {
      window.localStorage.setItem(KEY, asked)
      return asked
    }
    const saved = window.localStorage.getItem(KEY)
    if (isPace(saved)) return saved
  } catch {
    // Storage blocked: the live pace.
  }
  return "live"
}

let pace: Pace = initialPace()
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const usePace = () => useSyncExternalStore(subscribe, () => pace)

export function setPace(next: Pace) {
  pace = next
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    // Not remembered.
  }
  for (const fn of listeners) fn()
}

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const BOOT_MS = 820
const LINE_MS = 380
const FIRST_VISIT_MS = 520

/** Pages already "fetched" this session, by address: the query cache this stands in for. */
const fetched = new Set<string>([window.location.pathname])

/**
 * The cold start: the workspace's initials and name on the canvas, a line that fills, then the sheet
 * lifts off the shell that has been there underneath.
 */
export function BootScreen() {
  const { workspace } = useShellState()
  const [phase, setPhase] = useState<"on" | "lifting" | "off">(() => (FACTOR[pace] === 0 ? "off" : "on"))
  const skip = useRef(phase === "off")
  // Once, at the start.
  useEffect(() => {
    if (skip.current) return
    const ms = BOOT_MS * FACTOR[pace]
    const lift = window.setTimeout(() => setPhase("lifting"), ms)
    const gone = window.setTimeout(() => setPhase("off"), ms + 260)
    return () => {
      window.clearTimeout(lift)
      window.clearTimeout(gone)
    }
  }, [])
  if (phase === "off") return null
  const w = workspaceOf(workspace)
  const fill = BOOT_MS * FACTOR[pace]
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${w.name} laden`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-canvas transition-opacity duration-[260ms]"
      style={{ opacity: phase === "lifting" ? 0 : 1 }}
    >
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-lg bg-rail text-lg font-semibold text-rail-fg">
          {w.name.split(/\s+/).map((x) => x[0] ?? "").slice(0, 2).join("").toUpperCase()}
        </span>
        <span className="text-sm font-medium text-ink">{w.name}</span>
        <span aria-hidden="true" className="relative h-0.5 w-28 overflow-hidden rounded-full bg-line">
          <BootFill ms={fill} />
        </span>
      </div>
    </div>
  )
}

function BootFill({ ms }: { readonly ms: number }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOn(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return (
    <span
      className="absolute inset-y-0 left-0 rounded-full bg-accent ease-out"
      style={{ width: on ? "100%" : "8%", transitionProperty: "width", transitionDuration: `${still() ? 0 : ms}ms` }}
    />
  )
}

/**
 * A navigation: a thin line fills across the top of the work and fades. A page not visited yet this
 * session holds its skeleton meanwhile.
 */
export function ProgressLine() {
  const { pathname } = useRoute()
  const prev = useRef(pathname)
  const [run, setRun] = useState<{ readonly id: number; readonly phase: "start" | "fill" | "done" } | null>(null)

  // Before the paint, so a first visit never flashes its content before the skeleton.
  useLayoutEffect(() => {
    if (prev.current === pathname) return
    prev.current = pathname
    const factor = FACTOR[pace]
    if (factor === 0) return
    if (!fetched.has(pathname)) {
      fetched.add(pathname)
      holdLoading(FIRST_VISIT_MS * factor)
    }
    const id = Date.now()
    setRun({ id, phase: "start" })
    const frame = window.requestAnimationFrame(() => setRun({ id, phase: "fill" }))
    const done = window.setTimeout(() => setRun({ id, phase: "done" }), LINE_MS * factor)
    const gone = window.setTimeout(() => setRun(null), LINE_MS * factor + 240)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(done)
      window.clearTimeout(gone)
    }
  }, [pathname])

  if (run === null) return null
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-30 h-0.5 bg-accent"
      style={{
        width: run.phase === "start" ? "0%" : run.phase === "fill" ? "88%" : "100%",
        opacity: run.phase === "done" ? 0 : 1,
        transitionProperty: "width, opacity",
        transitionDuration: run.phase === "fill"
          ? `${LINE_MS * FACTOR[pace]}ms`
          : run.phase === "done"
          ? "240ms"
          : "0ms",
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)"
      }}
    />
  )
}

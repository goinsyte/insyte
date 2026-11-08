import { motion, useReducedMotion } from "motion/react"
import { Check, Loader } from "../../icons"
import { useCountUp } from "../hooks/use-count-up"
import type { StepDef } from "./onboarding-shell"

/* ─── Sync progress — the first import, counted in ───────────────────────── */

/**
 * The sync step's list, from what the host knows: the design app counts its seed up (`admin-steps.tsx`); the console
 * shows the mirror's counts as the import writes them (`live`), each row done when its resource is in. Store-free.
 */
export interface SyncRowData {
  readonly id: string
  readonly label: string
  readonly to: number
  readonly delay: number
  /** Done before the count says so: a live import knows a resource is in, whatever its count. */
  readonly done?: boolean | undefined
}

export function SyncProgress({ connected, rows, live = false }: {
  connected: boolean
  rows: ReadonlyArray<SyncRowData>
  /** Counts as they are, not counted up from zero: they change while the import runs. */
  live?: boolean
}) {
  if (!connected) {
    return (
      <div className="rounded-xl bg-paper p-4 text-base text-ink-2 leading-normal">
        Nog geen winkel gekoppeld. Koppel Shopify wanneer je wilt via{" "}
        <span className="font-medium text-ink">Instellingen, Koppelingen</span>. De rest van de inrichting werkt gewoon.
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => <SyncRow key={r.id} label={r.label} to={r.to} delay={r.delay} done={r.done} live={live} />)}
    </ul>
  )
}

function SyncRow({ label, to, delay, done: known, live }: {
  label: string
  to: number
  delay: number
  done?: boolean | undefined
  live: boolean
}) {
  const still = useReducedMotion()
  const n = useCountUp(to, still || live ? 0 : 1600, delay)
  const done = known ?? n === to
  return (
    <li className="relative flex h-11 items-center gap-3 overflow-hidden rounded-lg bg-paper px-3.5">
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-arc-tint"
        initial={false}
        animate={{ width: `${to === 0 ? 0 : (n / to) * 100}%`, opacity: done ? 0 : 1 }}
        transition={{ width: { duration: 0.1 }, opacity: { duration: 0.4 } }}
      />
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        {done ?
          (
            <motion.span initial={still ? false : { scale: 0.4 }} animate={{ scale: 1 }}>
              <Check className="size-4 text-signal-green" strokeWidth={2.5} />
            </motion.span>
          ) :
          <Loader className="size-4 animate-spin text-arc-ink" strokeWidth={2} />}
      </span>
      <span className="relative flex-1 font-medium text-base text-ink">{label}</span>
      <span className="relative text-sm text-ink-2 tabular-nums">{n.toLocaleString("nl-NL")}</span>
    </li>
  )
}

/** The sync step's frame: its copy, and going on once the import allows it. */
export function syncStep({ connected, rows, live, canContinue, onPrimary }: {
  connected: boolean
  rows: ReadonlyArray<SyncRowData>
  live?: boolean
  canContinue: boolean
  onPrimary: () => void | Promise<void>
}): StepDef {
  return {
    id: "sync",
    title: "Alles wordt opgehaald.",
    subtitle: "De eerste gegevens staan er binnen een paar seconden. Daarna kun je doorgaan.",
    canContinue,
    primaryLabel: "Laat Insyte kijken",
    onPrimary,
    content: <SyncProgress connected={connected} rows={rows} live={live} />
  }
}

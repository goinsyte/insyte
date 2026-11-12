import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import type { Plate, Signal } from "../../data-source"
import { X } from "../../icons"
import { FilterButton, FilterChips } from "../filters/filter-bar"
import { useListFilter } from "../filters/use-list-filter"
import { applyFilter, type FilterField } from "../lib/filter"
import { cn } from "../lib/utils"
import { PlateEmpty, type PlatePhase, PlateView } from "./plate"

/*
 * "Je wachtrij" and its plate (PLAN, widgets/02 widget `queue`), out of the Start screen so a host can give it rows:
 * the design app from its workspace store, the console from `Queue.list` (M10.1). The rows, their tabs and filter,
 * the keyboard (J K E R D), a decision settling on the board before the next row draws, and the plate panel over the
 * right of the board. What a decision does is the host's (`QueueSource.decide`).
 */

export type QueueState = "open" | "filed" | "discarded"

/** One row as the queue draws it: pre-formatted figures, in the row's own words. */
export type QueueEntry = {
  id: string
  signal: Signal
  title: string
  /** The store's name, or "Alle winkels". */
  store: string
  value: string
  due: string
  state: QueueState
  plate?: Plate | undefined
  redraws: number
}

export interface QueueSource {
  rows: ReadonlyArray<QueueEntry>
  /** Files the row's plate, or sets the row aside; the host says what it did, with its Undo. */
  decide: (row: QueueEntry, phase: "filed" | "discarded") => void
  /** Draws the plate again; absent where nothing draws plates yet. */
  redraw?: ((id: string) => void) | undefined
}

export const isNeedsYou = (q: QueueEntry) => q.state === "open" && (q.signal === "red" || q.signal === "amber")
export const isDrawn = (q: QueueEntry) => q.state === "open" && q.plate !== undefined

type QueueFilterId = "needs-you" | "drawn" | "everything"

/* What the queue can be filtered by. The row's kind is the first word of what happened, which is
   how the queue already writes it: "Chargeback DSP-2214 …", "Supplier Linyi …". */
const SIGNAL_LABEL: Record<Signal, string> = {
  red: "Binnen enkele uren",
  amber: "Vandaag",
  green: "Op schema",
  idle: "Geen deadline"
}
const QUEUE_FIELDS: ReadonlyArray<FilterField<QueueEntry>> = [
  {
    id: "signal",
    label: "Urgentie",
    type: "option",
    options: (Object.keys(SIGNAL_LABEL) as Signal[]).map((v) => ({ value: v, label: SIGNAL_LABEL[v] })),
    get: (r) => r.signal
  },
  { id: "kind", label: "Soort", type: "option", get: (r) => r.title.split(" ")[0] ?? "" },
  { id: "store", label: "Winkel", type: "option", get: (r) => r.store },
  {
    id: "drawn",
    label: "Voorstel",
    type: "option",
    options: [
      { value: "yes", label: "Getekend door Insyte" },
      { value: "no", label: "Jij moet beginnen" }
    ],
    get: (r) => (r.plate ? "yes" : "no")
  },
  { id: "title", label: "Wat er gebeurde", type: "text", get: (r) => r.title },
  {
    id: "value",
    label: "Waarde",
    type: "number",
    get: (r) => Number.parseFloat(r.value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0
  }
]

/** How long a filed plate stays on the board, stamped and slackened, before the next one draws. */
export const SETTLE_MS = 900

/**
 * The queue as a card body and its plate as a panel, for the host to place: `body` on the board, `plate` after it.
 * `active` is whether the keyboard works the queue (the Overzicht view).
 */
export function useQueuePanel(
  source: QueueSource,
  active: boolean
): { body: ReactNode; plate: ReactNode; needsYou: number; select: (id: string) => void } {
  const { rows: queue, decide: hostDecide, redraw } = source
  const still = useReducedMotion()
  const [filter, setFilter] = useState<QueueFilterId>("needs-you")
  // Starts null on purpose: see `PlateUnselected`. The first pick is what draws the plate.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The decision just taken, held on the board for SETTLE_MS so it can be seen to have happened.
  const [settling, setSettling] = useState<{ id: string; phase: PlatePhase } | null>(null)

  const needsYou = queue.filter(isNeedsYou)
  const drawn = queue.filter(isDrawn)
  const filters: Array<{ id: QueueFilterId; label: string; count: number }> = [
    { id: "needs-you", label: "Wacht op jou", count: needsYou.length },
    { id: "drawn", label: "Getekend", count: drawn.length },
    { id: "everything", label: "Alles", count: queue.length }
  ]

  const { filter: refine, setFilter: setRefine, saveView } = useListFilter("queue")

  // A settling row stays in its list until it has been seen to settle, then the list closes over it.
  const rows = useMemo(() => {
    const keep = (q: QueueEntry) => q.id === settling?.id
    const tab = filter === "needs-you"
      ? queue.filter((q) => isNeedsYou(q) || keep(q))
      : filter === "drawn"
      ? queue.filter((q) => isDrawn(q) || keep(q))
      : [...queue]
    return applyFilter(tab, refine, QUEUE_FIELDS)
  }, [queue, filter, settling, refine])

  const selected = rows.find((r) => r.id === selectedId) ?? null

  /** The next row the operator has not decided yet, after `id` in the list they are working. */
  const nextAfter = useCallback(
    (id: string) => {
      const open = rows.filter((r) => r.state === "open" && r.id !== id)
      const at = rows.findIndex((r) => r.id === id)
      return open.find((r) => rows.indexOf(r) > at) ?? open[0] ?? null
    },
    [rows]
  )

  const decide = useCallback(
    (row: QueueEntry, phase: Exclude<PlatePhase, "drawn">) => {
      hostDecide(row, phase)
      setSettling({ id: row.id, phase })
      const next = nextAfter(row.id)
      window.setTimeout(() => {
        setSettling(null)
        setSelectedId(next?.id ?? null)
      }, SETTLE_MS)
    },
    [hostDecide, nextAfter]
  )

  const select = useCallback(
    (id: string) => {
      const row = queue.find((q) => q.id === id)
      if (!row) return
      if (!isNeedsYou(row)) setFilter("everything")
      setSelectedId(row.id)
    },
    [queue]
  )

  // The keyboard is how a queue is worked. Inert while typing, and while a dialog owns the keys.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      const open = rows.filter((r) => r.state === "open")
      const at = open.findIndex((r) => r.id === selectedId)
      const k = e.key.toLowerCase()
      if (e.key === "Escape" && selectedId !== null) {
        setSelectedId(null)
      } else if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedId((open[at + 1] ?? open[0])?.id ?? null)
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedId((open[at - 1] ?? open[open.length - 1])?.id ?? null)
      } else if (selected && !settling) {
        if (k === "e" && selected.plate) decide(selected, "filed")
        else if (k === "d" || e.key === "Backspace") decide(selected, "discarded")
        else if (k === "r" && selected.plate && redraw) redraw(selected.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, rows, selectedId, selected, settling, decide, redraw])

  const phase: PlatePhase = settling && settling.id === selected?.id ? settling.phase : "drawn"

  const queueFilter = (
    <FilterButton
      fields={QUEUE_FIELDS}
      rows={[...queue]}
      value={refine}
      onChange={(g) => {
        setRefine(g)
        setSelectedId(null)
      }}
      onSaveView={saveView}
      tone="mesh"
    />
  )
  const queueChips = (
    <FilterChips
      fields={QUEUE_FIELDS}
      rows={[...queue]}
      value={refine}
      onChange={setRefine}
      tone="mesh"
      className="px-4 pb-2"
    />
  )

  const body = (
    <div className="-mx-4 -mb-4 flex min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Filter wachtrij">
        {filters.map((f) => {
          const on = f.id === filter
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setFilter(f.id)
                // Changing filter clears the selection rather than guessing a new
                // one: the plate beside it belongs to a row the operator chose.
                setSelectedId(null)
              }}
              className={cn(
                "relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-base transition-colors",
                on ? "font-medium text-mesh-ink" : "text-mesh-ink-2 hover:bg-white/8 hover:text-mesh-ink"
              )}
            >
              {on ?
                (
                  <motion.span
                    layoutId="queue-filter"
                    className="absolute inset-0 rounded-md bg-white/14"
                    transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                    aria-hidden
                  />
                ) :
                null}
              <span className="relative">{f.label}</span>
              <span className="relative tabular-nums opacity-70">{f.count}</span>
            </button>
          )
        })}
        <div className="ml-auto">{queueFilter}</div>
      </div>
      {queueChips}

      <div className="flex h-6 items-center gap-3.5 px-4 text-sm text-mesh-ink-2" role="presentation">
        <span className="w-[7px] shrink-0" />
        <span className="min-w-0 flex-1">Wat er gebeurde</span>
        <span className="hidden w-[116px] shrink-0 md:block">Winkel</span>
        <span className="hidden w-[88px] shrink-0 sm:block">Waarde</span>
        <span className="w-[66px] shrink-0">Resterend</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col" role="listbox" aria-label="Zaken die op jou wachten" tabIndex={-1}>
        <AnimatePresence initial={false}>
          {rows.map((row, i) => (
            <QueueItem
              key={row.id}
              row={row}
              banded={i % 2 === 0}
              selected={row.id === selected?.id}
              onSelect={() => setSelectedId(row.id)}
            />
          ))}
        </AnimatePresence>
        <p className="px-4 pt-3 pb-4 text-sm text-mesh-ink-2" role="presentation">
          {rows.length === 0
            ? "Niets gevonden. Nieuwe zaken verschijnen bovenaan."
            : "Dat is alles. Nieuwe zaken verschijnen bovenaan."}
        </p>
      </div>
    </div>
  )

  /*
   * The plate, as a panel over the right of the board rather than a column beside the queue.
   * It is not modal: the queue stays clickable behind it, so moving down the list redraws it,
   * and J K E R D keep working. Escape, or the close button, puts it away.
   */
  const plate = (
    <AnimatePresence>
      {selected && active ?
        (
          <motion.div
            key="plate"
            initial={still ? false : { x: 460, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={still
              ? { opacity: 0 }
              : { x: 460, opacity: 0.6, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed top-12 right-0 bottom-0 z-30 flex w-full shadow-[-24px_0_60px_-30px_rgb(0_0_0/0.45)] sm:w-[436px]"
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Voorstel sluiten"
              className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-md text-mesh-ink-2 transition-colors hover:bg-mesh-ink/10 hover:text-mesh-ink"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
            {selected.plate ?
              (
                <PlateView
                  plate={selected.plate}
                  drawing={selected.redraws}
                  phase={phase}
                  onFile={() => decide(selected, "filed")}
                  onRedraw={() => redraw?.(selected.id)}
                  onDiscard={() => decide(selected, "discarded")}
                />
              ) :
              <PlateEmpty onDismiss={() => decide(selected, "discarded")} settling={phase !== "drawn"} />}
          </motion.div>
        ) :
        null}
    </AnimatePresence>
  )

  return { body, plate, needsYou: needsYou.length, select }
}

const DOT: Record<Signal, string> = {
  red: "bg-signal-red",
  amber: "bg-signal-amber",
  green: "bg-signal-green",
  idle: "bg-ink-4"
}

/* On the mesh the signal colours are too dark to read and their tonal backgrounds too pale to tell
   apart, so a waiting row's dot is its signal lifted toward white; the selected row is paper again
   and takes the full colour. */
const DOT_ON_MESH: Record<Signal, string> = {
  red: "bg-[color-mix(in_oklch,var(--signal-red)_70%,white)]",
  amber: "bg-[color-mix(in_oklch,var(--signal-amber)_60%,white)]",
  green: "bg-[color-mix(in_oklch,var(--signal-green)_65%,white)]",
  idle: "bg-mesh-ink-3"
}

/**
 * One row. Selected is a flood to `abyss` — the same thing the rail's active tile does — never a
 * ring, never a left border, never a tint that has to compete with the signal dot.
 */
function QueueItem({
  row,
  banded,
  selected,
  onSelect
}: {
  row: QueueEntry
  banded: boolean
  selected: boolean
  onSelect: () => void
}) {
  const still = useReducedMotion()
  const done = row.state !== "open"
  return (
    <motion.button
      layout={still ? false : "position"}
      // Leaving is closing: the row folds to nothing and the rows below rise into its place.
      exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex h-[34px] w-full shrink-0 cursor-pointer items-center gap-3.5 overflow-hidden px-4 text-left text-base transition-colors duration-[80ms]",
        selected
          ? "bg-paper text-ink"
          : cn(banded && "bg-white/[0.05]", done ? "text-mesh-ink-2" : "text-mesh-ink", "hover:bg-white/10")
      )}
    >
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full transition-opacity duration-[240ms]",
          selected ? DOT[row.signal] : DOT_ON_MESH[row.signal],
          // Filing slackens the row: it loses its dot, the one mark that said it was waiting.
          done && "opacity-0"
        )}
        aria-hidden
      />
      <span className={cn("min-w-0 flex-1 truncate", done && !selected && "line-through decoration-mesh-ink-3")}>
        {row.title}
      </span>
      <span
        className={cn(
          "hidden w-[116px] shrink-0 truncate tabular-nums md:block",
          selected ? "text-ink-2" : "text-mesh-ink-2"
        )}
      >
        {row.store}
      </span>
      <span
        className={cn(
          "hidden w-[88px] shrink-0 tabular-nums sm:block",
          selected ? "text-ink-2" : "text-mesh-ink-2"
        )}
      >
        {row.value}
      </span>
      <span
        className={cn(
          "w-[66px] shrink-0 tabular-nums",
          selected ? "text-ink-2" : "text-mesh-ink-2"
        )}
      >
        {done ? (row.state === "filed" ? "uitgevoerd" : "—") : row.due}
      </span>
    </motion.button>
  )
}

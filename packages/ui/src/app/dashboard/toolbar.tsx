import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Switch } from "../../components/switch"
import {
  Calendar,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  LayoutGrid,
  Newspaper,
  Plus,
  RefreshCcw,
  RotateCcw
} from "../../icons"
import { Glyph } from "../common/glyph"
import { ago } from "../lib/home/dates"
import type { Currency } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import {
  type BoardEngine,
  type BoardLayout,
  type BoardRange,
  type HomeView,
  useHome,
  type WidgetId
} from "../stores/home-store"
import { WIDGET_DEFS as WIDGETS } from "./widget-defs"

/*
 * The row under the greeting, as ClickUp's home has it: the views on the left, and on the right the
 * board's clock and what can be done to it. The clock is honest: "Bijgewerkt" counts up from the
 * last time the board read the workspace, and with auto refresh on it reads it again every minute
 * and lets the live orders keep arriving.
 */

const VIEWS: ReadonlyArray<{ id: HomeView; label: string; icon: typeof Calendar }> = [
  { id: "overzicht", label: "Overzicht", icon: LayoutDashboard },
  { id: "werk", label: "Mijn werk", icon: ClipboardCheck },
  { id: "agenda", label: "Agenda", icon: Calendar },
  { id: "activiteit", label: "Activiteit", icon: Newspaper }
]

export function ViewTabs({
  view,
  onView,
  counts,
  views
}: {
  view: HomeView
  onView: (v: HomeView) => void
  counts: Partial<Record<HomeView, number>>
  /** The views there are to read; all four unless said. */
  views?: ReadonlyArray<HomeView>
}) {
  return (
    <div
      role="tablist"
      aria-label="Weergave van de start"
      className="-mb-px flex min-w-0 items-center gap-0.5 overflow-x-auto"
    >
      {VIEWS.filter((v) => views === undefined || views.includes(v.id)).map((v) => {
        const on = v.id === view
        const n = counts[v.id]
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`home-tab-${v.id}`}
            aria-selected={on}
            aria-controls={`home-panel-${v.id}`}
            onClick={() => onView(v.id)}
            className={cn(
              "glyph-host relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 text-base transition-colors",
              on ? "font-medium text-ink" : "text-ink-2 hover:text-ink"
            )}
          >
            <Glyph
              icon={v.icon}
              size={14}
              draw={false}
              className={cn("max-sm:hidden", on ? "text-arc-ink" : "text-ink-3")}
            />
            {v.label}
            {n ? <span className="rounded-sm bg-ink/6 px-1 text-xs text-ink-2 tabular-nums">{n}</span> : null}
            {on ?
              (
                <motion.span
                  layoutId="home-view"
                  aria-hidden
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-arc"
                  transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                />
              ) :
              null}
          </button>
        )
      })}
    </div>
  )
}

/** The board's clock: the demo's live store keeps it (`RefreshControl`), the console's reads keep it there. */
export type RefreshSource = { refreshedAt: number; refreshing: boolean; refresh: () => void }

/** "Bijgewerkt zojuist" with a refresh on click, and the switch that keeps it refreshing itself. */
export function RefreshView({ source }: { source: RefreshSource }) {
  const { refreshedAt, refreshing, refresh } = source
  const auto = useHome((s) => s.autoRefresh)
  const setAuto = useHome((s) => s.setAutoRefresh)
  const still = useReducedMotion()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={refresh}
        title="Nu bijwerken"
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
      >
        <motion.span
          className="flex"
          animate={refreshing && !still ? { rotate: -360 } : { rotate: 0 }}
          transition={refreshing ? { duration: 0.65, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
        >
          <RefreshCcw className="size-3.5 text-ink-3" strokeWidth={1.75} />
        </motion.span>
        <span aria-live="polite">{refreshing ? "Bijwerken" : `Bijgewerkt ${ago(refreshedAt)}`}</span>
      </button>
      <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink-2 hover:bg-ink/6 hover:text-ink">
        <span className="hidden lg:inline">Automatisch</span>
        <Switch size="sm" checked={auto} onCheckedChange={setAuto} aria-label="Automatisch bijwerken" />
      </label>
    </div>
  )
}

const RANGES: ReadonlyArray<{ days: BoardRange; label: string }> = [
  { days: 7, label: "7 dagen" },
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" }
]
const CURRENCIES: ReadonlyArray<Currency> = ["EUR", "USD", "GBP"]

/**
 * The window every dated figure reads and the currency every amount is said in, as one menu. `currency` fixes the
 * currency (the console's is the workspace's) and leaves only the window to choose; `range` and `onRange` keep the
 * window outside the board's own store.
 */
export function WindowMenu({
  currency: fixed,
  range: held,
  onRange
}: {
  currency?: Currency
  /** The window when the host keeps it (the console's, in the member's preferences). */
  range?: BoardRange
  onRange?: (r: BoardRange) => void
} = {}) {
  const stored = useHome((s) => s.range)
  const setStored = useHome((s) => s.setRange)
  const range = held ?? stored
  const setRange = onRange ?? setStored
  const chosen = useHome((s) => s.currency)
  const setCurrency = useHome((s) => s.setCurrency)
  const currency = fixed ?? chosen
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Periode ${range} dagen, bedragen in ${currency}`}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 tabular-nums transition-colors hover:bg-ink/6 hover:text-ink"
        >
          {range} dagen · {currency}
          <ChevronDown className="size-3 text-ink-3" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Periode</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(range)} onValueChange={(v) => setRange(Number(v) as BoardRange)}>
          {RANGES.map((r) => (
            <DropdownMenuRadioItem key={r.days} value={String(r.days)}>
              Laatste {r.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {fixed === undefined ?
          (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Bedragen tonen in</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                {CURRENCIES.map((c) => (
                  <DropdownMenuRadioItem key={c} value={c}>
                    {c}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) :
          null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Every card that is not on the board, one click from being on it; of `offered` only, when said. */
export function AddCardMenu(
  { onAdded, offered }: { onAdded?: (id: WidgetId) => void; offered?: ReadonlyArray<WidgetId> }
) {
  const widgets = useHome((s) => s.widgets)
  const add = useHome((s) => s.add)
  const hidden = (offered ?? (Object.keys(WIDGETS) as WidgetId[])).filter((id) => !widgets.some((w) => w.id === id))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Kaart toevoegen
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
        <DropdownMenuLabel>
          {hidden.length === 0 ? "Alle kaarten staan op je bord" : "Aan je bord toevoegen"}
        </DropdownMenuLabel>
        {hidden.map((id) => {
          const w = WIDGETS[id]
          return (
            <DropdownMenuItem
              key={id}
              onClick={() => {
                add(id, w.defaultSize, w.defaultTone)
                onAdded?.(id)
                undoable(`${w.title} toegevoegd aan je bord`, () => useHome.getState().remove(id))
              }}
              className="glyph-host h-auto items-start gap-2.5 py-2"
            >
              <Glyph icon={w.icon} tile="mist" size={14} draw={false} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-ink">{w.title}</span>
                <span className="text-xs text-ink-3">{w.blurb}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ENGINES: ReadonlyArray<{ id: BoardEngine; label: string; hint: string }> = [
  { id: "masonry", label: "Kolommen", hint: "Natuurlijke hoogtes, verdeeld over kolommen" },
  { id: "grid", label: "Raster", hint: "Vrij plaatsen en van formaat veranderen" }
]

/** While arranging: which engine lays the board out, and Reset with Undo; to `defaults` when the board has its own. */
export function EditTools({ defaults }: { defaults?: BoardLayout } = {}) {
  const engine = useHome((s) => s.engine)
  const setEngine = useHome((s) => s.setEngine)
  const reset = useHome((s) => s.reset)
  const snapshot = useHome((s) => s.snapshot)
  const restore = useHome((s) => s.restore)
  return (
    <div className="flex items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label="Indeling van het bord"
        className="flex h-8 items-center rounded-md bg-ink/6 p-0.5"
      >
        {ENGINES.map((e) => {
          const on = e.id === engine
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={e.hint}
              onClick={() => setEngine(e.id)}
              className={cn(
                "relative flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 font-medium text-sm transition-colors",
                on ? "text-ink" : "text-ink-2 hover:text-ink"
              )}
            >
              {on ?
                (
                  <motion.span
                    layoutId="board-engine"
                    className="absolute inset-0 rounded-[7px] bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                    transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                    aria-hidden
                  />
                ) :
                null}
              <span className="relative">{e.label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          const before = snapshot()
          if (defaults) restore(defaults)
          else reset()
          undoable("Bord teruggezet naar de standaardindeling", () => restore(before))
        }}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
      >
        <RotateCcw className="size-3.5" strokeWidth={1.75} />
        Herstellen
      </button>
    </div>
  )
}

export function CustomizeButton({ editing, onEditing }: { editing: boolean; onEditing: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEditing(!editing)}
      aria-pressed={editing}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-sm transition-colors",
        editing ? "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2" : "text-ink-2 hover:bg-ink/6 hover:text-ink"
      )}
    >
      {editing ? null : <LayoutGrid className="size-3.5" strokeWidth={1.75} />}
      {editing ? "Klaar" : "Aanpassen"}
    </button>
  )
}

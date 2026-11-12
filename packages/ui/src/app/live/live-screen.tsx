import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, CreditCard, Eye, Pause, Play, ShoppingBag } from "../../icons"
import { useNow } from "../ask/agent-parts"
import { EmptyPage } from "../common/empty-page"
import { PageGuide } from "../common/page-guide"
import { PageHeader } from "../common/page-header"
import { formatCurrency } from "../lib/format"
import type { Currency } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { GRIDS, type MapView } from "../lib/world-dots"
import { WidgetBones } from "../loading/page-skeletons"
import { type Stage, STAGE_LABEL } from "../stores/visitors-store"
import { Segmented } from "../team/bits"
import {
  type LiveConnection,
  type LiveFeedEvent as LiveEvent,
  type LiveVisitor as Visitor,
  useLiveSource
} from "./live-source"

const GUIDE = [{
  title: "Wie er nu op je winkel is",
  body:
    "Elke stip is een bezoeker. Zie waar ze vandaan komen, wat ze bekijken en wie er afrekent, terwijl het gebeurt.",
  art: "chart"
}] as const

/* Stage marks on the plate: chalk for looking, the two atmosphere tints for the cart and the
   checkout, and paper for a sale. The legend under the map carries the words. */
const STAGE_FILL: Record<Stage, string> = {
  browsing: "var(--mesh-ink-2)",
  cart: "var(--sky)",
  checkout: "var(--powder)",
  bought: "var(--paper)"
}

type View = MapView

/** The header's status, by the connection: the design's three, and the console's way back after a drop. */
const STATUS: Record<LiveConnection, string> = {
  connecting: "Verbinden",
  live: "Werkt zichzelf bij",
  reconnecting: "Opnieuw verbinden",
  error: "Geen verbinding"
}

/**
 * Live (`/live`, PLAN 41): the store right now. One plate: the funnel in the plate's own figures,
 * the world as a dot matrix with every visitor on it, and a title block at the foot. Under it, what
 * just happened, and what they are looking at, where they are and where they came from. Who is on
 * the store comes from the host (`live-source.tsx`).
 */
export function LivePage() {
  const navigate = useNavigate()
  const source = useLiveSource()
  /* The page and the map's land are drawn with the frame; who is on the store comes over the live
     connection, which opens after the page does (ADR-0028). Until it has, the figures are bones and
     the map is land without anyone on it. A connection that dropped keeps the last figures. */
  const connected = source.connection === "live" || source.connection === "reconnecting"
  const visitors = connected ? source.visitors : NO_VISITORS
  const events = connected ? source.events : NO_EVENTS
  const paused = source.paused
  const now = useNow(1000)
  const [view, setView] = useState<View>("world")
  const [focus, setFocus] = useState<string | null>(null)

  const count = (st: Stage) => visitors.filter((v) => v.stage === st).length
  const boughtToday = events.filter((e) => e.kind === "bought" && now - e.at < 10 * 60_000).length
  const funnel: Array<{ stage: Stage; n: number; label: string }> = [
    { stage: "browsing", n: visitors.filter((v) => v.stage !== "bought").length, label: "Op de winkel" },
    { stage: "cart", n: count("cart") + count("checkout"), label: "Met iets in het mandje" },
    { stage: "checkout", n: count("checkout"), label: "Rekent af" },
    { stage: "bought", n: boughtToday, label: "Gekocht, laatste 10 min" }
  ]

  if (source.connection === "error") {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Live" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
        <div role="alert" className="flex flex-col items-start gap-3 px-5 pb-12">
          <p className="text-base text-ink-2">Live kon niet worden geladen.</p>
          {source.retry
            ? (
              <button
                type="button"
                onClick={source.retry}
                className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
              >
                Opnieuw proberen
              </button>
            )
            : null}
        </div>
      </div>
    )
  }

  /* Nothing to show says why: no store yet, a store without the Live pixel, or nobody right now. */
  if (connected && (source.pixel !== "installed" || (visitors.length === 0 && events.length === 0))) {
    const toStores = () => void navigate({ to: "/settings/stores" })
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Live" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
        {source.pixel === "no_store"
          ? (
            <EmptyPage
              kind="live"
              count="0 bezoekers"
              title="Nog niemand op je winkel"
              body="Live laat zien wie er nu op je winkel is, waar ze vandaan komen en wie er afrekent. Het begint zodra je Shopify-winkel gekoppeld is en de eerste bezoeker binnenkomt."
              action={{ label: "Winkel koppelen", onClick: toStores }}
            />
          )
          : source.pixel === "not_installed"
          ? (
            <EmptyPage
              kind="live"
              count="0 bezoekers"
              title="Live staat nog niet aan"
              body="Zet de Live-pixel aan voor je winkel bij Instellingen → Winkels. Daarna zie je hier wie er op je winkel is, waar ze vandaan komen en wie er afrekent."
              action={{ label: "Naar Winkels", onClick: toStores }}
            />
          )
          : (
            <EmptyPage
              kind="live"
              count="0 bezoekers"
              title="Nog niemand op je winkel"
              body={`De Live-pixel staat aan op ${source.storesLabel}. Zodra er iemand op je winkel komt, zie je het hier.`}
            />
          )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Live"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        meta={
          <span className="flex items-center gap-1.5 text-ink-3 text-sm">
            <span
              aria-hidden
              className={cn(
                "size-1.5",
                source.connection !== "live"
                  ? "animate-pulse bg-ink-4"
                  : paused
                  ? "bg-ink-4"
                  : "animate-pulse bg-signal-green"
              )}
            />
            {source.connection === "live" && paused ? "Gepauzeerd" : STATUS[source.connection]} · {source.storesLabel}
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => source.setPaused(!paused)}
            className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
          >
            {paused
              ? <Play className="size-3.5" strokeWidth={1.75} />
              : <Pause className="size-3.5" strokeWidth={1.75} />}
            {paused ? "Hervatten" : "Pauzeren"}
          </button>
        }
      />

      <div className="flex min-w-0 flex-col gap-8 px-5 pb-12">
        <section aria-label="Nu op de winkel" className="plate relative overflow-hidden rounded-xl">
          <span className="plate-scan" aria-hidden />
          <div className="flex flex-wrap items-end gap-x-2 gap-y-4 px-6 pt-6">
            {funnel.map((f, i) => (
              <div key={f.stage} className="flex items-end gap-2">
                {i > 0 ?
                  (
                    <span className="mb-2 flex flex-col items-center px-1 text-mesh-ink-2 text-xs tabular-nums">
                      {/* The last step counts ten minutes of sales, not people now, so it gets no rate. */}
                      {f.stage !== "bought" && funnel[i - 1]!.n
                        ? `${Math.round((f.n / funnel[i - 1]!.n) * 100)}%`
                        : "\u00a0"}
                      <ArrowRight className="size-4" strokeWidth={1.5} />
                    </span>
                  ) :
                  null}
                <div className="flex min-w-[96px] flex-col gap-1.5">
                  <span className="figure text-4xl text-mesh-ink">{connected ? f.n : <FigureBone w={40} />}</span>
                  <span className="flex items-center gap-1.5 text-mesh-ink-2 text-xs">
                    <span aria-hidden className="size-1.5" style={{ background: STAGE_FILL[f.stage] }} />
                    {f.label}
                  </span>
                </div>
              </div>
            ))}
            <span className="flex-1" />
            <div className="flex flex-col items-end gap-1.5">
              <span className="figure text-4xl text-mesh-ink">
                {connected
                  ? formatCurrency(source.revenueToday, source.currency, { currencyDisplay: "narrowSymbol" })
                  : <FigureBone w={150} />}
              </span>
              <span className="text-mesh-ink-2 text-xs">Omzet vandaag</span>
            </div>
          </div>

          <div className="relative mt-4 flex flex-col-reverse gap-3 sm:block">
            <WorldMap visitors={visitors} view={view} focus={focus} onFocus={setFocus} />
            <div className="flex justify-end px-4 sm:absolute sm:top-2 sm:right-4 sm:px-0">
              <div
                role="radiogroup"
                aria-label="Kaart"
                className="flex h-8 items-center gap-0.5 rounded-md bg-mesh-ink/10 p-0.5"
              >
                {(
                  [
                    ["world", "Wereld"],
                    ["europe", "Europa"],
                    ["america", "Noord-Amerika"]
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={view === id}
                    onClick={() => setView(id)}
                    className={cn(
                      "h-7 rounded px-2.5 font-medium text-xs transition-colors",
                      view === id ? "bg-paper text-abyss" : "text-mesh-ink-2 hover:text-mesh-ink"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-mesh-hairline border-t px-6 py-2.5 text-mesh-ink-2 text-xs">
            {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2" style={{ background: STAGE_FILL[s] }} />
                {STAGE_LABEL[s]}
              </span>
            ))}
            <span className="flex-1" />
            <span className="tabular-nums">{visitors.length} nu · elke stip is een bezoeker</span>
          </footer>
        </section>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          {
            /* Until the connection is open the lists have not been counted, which is not the same as
					    empty: they stand as bones rather than saying "Nog niemand". */
          }
          {connected ? <Feed events={events} now={now} currency={source.currency} /> : <WidgetBones rows={5} />}
          <aside className="flex flex-col gap-6">
            {connected ?
              (
                <>
                  <Ranked
                    title="Bekijken nu"
                    rows={tally(visitors.filter((v) => v.stage !== "bought"), (v) => v.page)}
                  />
                  <Ranked title="Waar ze zijn" rows={tally(visitors, (v) => v.country)} />
                  <Ranked title="Waar ze vandaan komen" rows={tally(visitors, (v) => v.source)} />
                </>
              ) :
              <WidgetBones rows={6} />}
          </aside>
        </div>
      </div>
      <PageGuide id="live" title="Live" steps={GUIDE} />
    </div>
  )
}

function tally(vs: ReadonlyArray<Visitor>, key: (v: Visitor) => string) {
  const m = new Map<string, number>()
  for (const v of vs) m.set(key(v), (m.get(key(v)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
}

/* ── the map ──────────────────────────────────────────────────────────────────────────────── */

const NO_VISITORS: ReadonlyArray<Visitor> = []
const NO_EVENTS: ReadonlyArray<LiveEvent> = []

/** A figure not yet counted: a chalk bone the height of the numeral, so the row does not jump. */
function FigureBone({ w }: { w: number }) {
  return (
    <span
      aria-hidden
      className="bone-plate inline-block h-[0.82em] rounded-[5px] align-baseline"
      style={{ width: w }}
    />
  )
}

function WorldMap(
  { visitors, view, focus, onFocus }: {
    visitors: ReadonlyArray<Visitor>
    view: View
    focus: string | null
    onFocus: (id: string | null) => void
  }
) {
  const still = useReducedMotion()
  const g = GRIDS[view]
  const now = useNow(1000)
  const focused = visitors.find((v) => v.id === focus)
  /* A mark keeps roughly the same size on screen whichever view's grid it sits on. */
  const size = 0.9 * Math.sqrt(GRIDS.world.cols / g.cols) * (view === "europe" ? 1.6 : 1)
  const at = focused ? g.project(focused.lon, focused.lat) : null
  return (
    <div className="relative px-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg
          key={view}
          initial={still ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={still ? undefined : { opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          viewBox={`0 0 ${g.cols} ${g.rows}`}
          className="mx-auto block h-auto max-h-[440px] w-full"
          style={{ aspectRatio: `${g.cols} / ${g.rows}` }}
          role="img"
          aria-label={`Kaart met ${visitors.length} bezoekers`}
        >
          <g fill="var(--mesh-ink)" opacity={0.17}>
            {g.land.map(([c, r]) => <rect key={`${c}.${r}`} x={c + 0.3} y={r + 0.3} width={0.4} height={0.4} />)}
          </g>
          {visitors.map((v) => {
            const p = g.project(v.lon, v.lat)
            if (p.x < 0 || p.y < 0 || p.x > g.cols || p.y > g.rows) return null
            const fresh = now - v.movedAt < 2400 && !still
            return (
              <g
                key={v.id}
                onPointerEnter={() => onFocus(v.id)}
                onPointerLeave={() => onFocus(null)}
                style={{ cursor: "pointer" }}
              >
                {fresh
                  ? (
                    <rect
                      x={p.x - size}
                      y={p.y - size}
                      width={size * 2}
                      height={size * 2}
                      fill="none"
                      stroke={STAGE_FILL[v.stage]}
                      strokeWidth={size * 0.14}
                      className="live-ping"
                      style={{ transformOrigin: `${p.x}px ${p.y}px`, transformBox: "view-box" }}
                    />
                  )
                  : null}
                <rect x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} fill={STAGE_FILL[v.stage]} />
                <rect x={p.x - size * 1.5} y={p.y - size * 1.5} width={size * 3} height={size * 3} fill="transparent" />
              </g>
            )
          })}
        </motion.svg>
      </AnimatePresence>
      <AnimatePresence>
        {focused && at ?
          (
            <motion.div
              key={focused.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="panel-raised pointer-events-none absolute z-10 w-60 rounded-lg bg-paper p-3 text-sm"
              style={{
                left: `${Math.min(78, Math.max(2, (at.x / g.cols) * 100))}%`,
                top: `${Math.min(68, Math.max(2, (at.y / g.rows) * 100 + 5))}%`
              }}
            >
              <span className="font-medium text-ink">
                {[focused.city, focused.country].filter(Boolean).join(", ")}
              </span>
              <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-ink-2 text-xs">
                <dt className="text-ink-3">Nu</dt>
                <dd className="truncate">{STAGE_LABEL[focused.stage]}</dd>
                <dt className="text-ink-3">Bekijkt</dt>
                <dd className="truncate">{focused.page}</dd>
                <dt className="text-ink-3">Via</dt>
                <dd>
                  {focused.source} · {focused.device}
                  {focused.returning ? " · eerder geweest" : ""}
                </dd>
                <dt className="text-ink-3">Op de winkel</dt>
                <dd className="tabular-nums">{ago(now - focused.arrivedAt)}</dd>
              </dl>
            </motion.div>
          ) :
          null}
      </AnimatePresence>
    </div>
  )
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim()
}

/* ── what happened ───────────────────────────────────────────────────────────────────────── */

const KIND_GLYPH = {
  arrive: Eye,
  cart: ShoppingBag,
  checkout: CreditCard,
  bought: CheckCircle2,
  browsing: Eye,
  leave: Eye
} as const

function sentence(e: LiveEvent, currency: Currency) {
  const who = `Iemand uit ${e.visitor.city || e.visitor.country}`
  if (e.kind === "arrive") {
    return `${who} kwam binnen via ${
      e.visitor.source.toLowerCase() === "direct" ? "een directe link" : e.visitor.source
    } op ${e.visitor.page}`
  }
  if (e.kind === "cart") return `${who} legde ${e.visitor.page} in het mandje`
  if (e.kind === "checkout") return `${who} begon met afrekenen`
  return `${who} kocht voor ${
    formatCurrency(e.amount ?? 0, currency, {
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }`
}

function Feed(
  { events, now, currency }: { events: ReadonlyArray<LiveEvent>; now: number; currency: Currency }
) {
  const [only, setOnly] = useState<"all" | "money">("all")
  const list = useMemo(
    () =>
      (only === "money"
        ? events.filter((e) => e.kind === "cart" || e.kind === "checkout" || e.kind === "bought")
        : events).slice(0, 18),
    [events, only]
  )
  const still = useReducedMotion()
  return (
    <section aria-labelledby="h-feed" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="h-feed" className="font-medium text-base text-ink">
          Wat er gebeurt
        </h2>
        <Segmented
          label="Toon"
          value={only}
          onChange={setOnly}
          options={[{ id: "all", label: "Alles" }, { id: "money", label: "Mandje en kopen" }]}
        />
      </div>
      <ol
        className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {list.map((e) => {
            const G = KIND_GLYPH[e.kind]
            return (
              <motion.li
                key={e.id}
                layout={!still}
                initial={still ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 text-sm odd:bg-mist/50",
                  e.kind === "bought" && "bg-signal-green-bg/60 odd:bg-signal-green-bg/60"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    e.kind === "bought" ? "bg-signal-green-bg text-signal-green" : "bg-ink/5 text-ink-3"
                  )}
                >
                  <G className="size-3.5" strokeWidth={1.75} />
                </span>
                <span
                  className={cn("min-w-0 flex-1 truncate", e.kind === "bought" ? "font-medium text-ink" : "text-ink-2")}
                >
                  {sentence(e, currency)}
                </span>
                {e.order ? <span className="shrink-0 text-ink-3 text-xs tabular-nums">{e.order}</span> : null}
                <span className="w-14 shrink-0 text-right text-ink-3 text-xs tabular-nums">
                  {now - e.at < 15_000 ? "zojuist" : ago(now - e.at)}
                </span>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
    </section>
  )
}

function Ranked({ title, rows }: { title: string; rows: ReadonlyArray<[string, number]> }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-base text-ink">{title}</h2>
      {rows.length ?
        (
          <ol className="flex flex-col gap-1.5">
            {rows.map(([k, n]) => (
              <li key={k} className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-2">{k}</span>
                  <span className="text-ink tabular-nums">{n}</span>
                </span>
                <span className="block h-1 overflow-hidden rounded-full bg-ink/6">
                  <motion.span
                    className="block h-full rounded-full bg-ink-3"
                    animate={{ width: `${(n / max) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </span>
              </li>
            ))}
          </ol>
        ) :
        <p className="text-ink-3 text-sm">Nog niemand.</p>}
    </section>
  )
}

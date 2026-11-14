import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type {
  BoardRange,
  HomeWidgets,
  PulseFigures,
  RevenueBreakdown,
  WidgetId
} from "@insyte/modules/home/domain/Home"
import type { StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { ManualSetupTask } from "@insyte/modules/onboarding/domain/Onboarding"
import { RevenueBreakdownView } from "@insyte/ui/app/dashboard/breakdown-view"
import { BestsellersView, CountriesView, LiveView, RecentView, ReturnsView } from "@insyte/ui/app/dashboard/card-views"
import { WIDGET_DEFS as WIDGETS } from "@insyte/ui/app/dashboard/widget-defs"
import {
  ChargebacksView,
  MyTicketsView,
  OrdersView,
  RevenueView,
  SetupView,
  StockView,
  SuppliersView,
  TeamView,
  TicketsView,
  TodoView
} from "@insyte/ui/app/dashboard/widget-views"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { PulseFigure } from "@insyte/ui/app/lib/home/pulse"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { WidgetBones } from "@insyte/ui/app/loading/page-skeletons"
import {
  type BoardEngine,
  type BoardLayout,
  type GridBox,
  type PlacedWidget,
  type Todo,
  useHome
} from "@insyte/ui/app/stores/home-store"
import type { Shortcut } from "@insyte/ui/app/stores/pins-store"
import { Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { presenceAtom } from "../data/frame.ts"
import { breakdownAtom, TODOS, todosAtom, todoWrites, widgetsAtom, widgetsKey } from "../data/home.ts"
import { completeTaskAtom, START } from "../data/onboarding.ts"
import { usePrefSection } from "../frame/prefs.ts"
import { ConsoleChats } from "./chats-card.tsx"
import { ConsoleBookmarks, ConsoleMentions, ConsoleToday } from "./home-views.tsx"
import { consoleSetupTasks, useCanOpenTask } from "./setup-tasks.tsx"

/*
 * Start's board in the console (M10.3), over `Home.widgets`: the design's cards drawn from the read, money from minor
 * units of the workspace currency, and the arrangement kept in the member's `board` preference. Only the cards the
 * console can fill are offered; automations (M12), Insyte and the customer agent (M15) come with their milestones,
 * and chargebacks (M13 step 4) reads the cases waiting on evidence. "Ongelezen chats" reads `Chats.list`
 * (`chats-card.tsx`), and the team card's "Bericht" opens the DM. "Agenda vandaag", "Vermeldingen en toegewezen" and
 * "Bladwijzers" (M10.3b) are `home-views.tsx`'s.
 */

/** The cards the console can fill, in the order "Kaart toevoegen" offers them. */
export const OFFERED: ReadonlyArray<WidgetId> = [
  "queue",
  "revenue",
  "orders",
  "chargebacks",
  "live",
  "tickets",
  "mytickets",
  "stock",
  "returns",
  "bestsellers",
  "countries",
  "suppliers",
  "team",
  "recent",
  "today",
  "mentions",
  "chats",
  "bookmarks",
  "todo",
  "setup"
]

/** The cards `Home.widgets` reads; the others are the frame's, the queue's or the person's own. */
const READ: ReadonlySet<WidgetId> = new Set([
  "revenue",
  "orders",
  "chargebacks",
  "suppliers",
  "tickets",
  "mytickets",
  "stock",
  "returns",
  "live",
  "bestsellers",
  "countries"
])

const placed = (id: WidgetId): PlacedWidget =>
  id === "queue" ? { id, size: 2, tone: "mesh" } : { id, size: WIDGETS[id].defaultSize, tone: WIDGETS[id].defaultTone }

/** The console's first board: the queue and the business at a glance, then the person's own. */
const CONSOLE_LAYOUT: BoardLayout = {
  widgets: ([
    "queue",
    "revenue",
    "orders",
    "live",
    "tickets",
    "mytickets",
    "stock",
    "returns",
    "bestsellers",
    "countries",
    "team",
    "recent"
  ] as const)
    .map(placed),
  grid: [
    { i: "queue", x: 0, y: 0, w: 8, h: 13 },
    { i: "revenue", x: 8, y: 0, w: 4, h: 13 },
    { i: "orders", x: 0, y: 13, w: 4, h: 9 },
    { i: "live", x: 4, y: 13, w: 4, h: 9 },
    { i: "tickets", x: 8, y: 13, w: 4, h: 9 },
    { i: "mytickets", x: 0, y: 22, w: 4, h: 9 },
    { i: "stock", x: 4, y: 22, w: 4, h: 9 },
    { i: "returns", x: 8, y: 22, w: 4, h: 9 },
    { i: "bestsellers", x: 0, y: 31, w: 4, h: 9 },
    { i: "countries", x: 4, y: 31, w: 4, h: 9 },
    { i: "team", x: 8, y: 31, w: 4, h: 9 },
    { i: "recent", x: 0, y: 40, w: 4, h: 9 }
  ]
}

/* ── the arrangement, in the member's preferences ─────────────────────────────────────────────────── */

/** `user_prefs.board`: what is on the board, where, laid out how, over which window. */
type BoardPref = BoardLayout & { engine: BoardEngine; range: BoardRange }

const BOARD_DEFAULT: BoardPref = { ...CONSOLE_LAYOUT, engine: "masonry", range: 30 }

const Placed = Schema.Struct({
  id: Schema.Literals(OFFERED),
  size: Schema.Literals([1, 2, 3]),
  tone: Schema.Literals(["paper", "tint", "mist", "mesh"])
})
const Box = Schema.Struct({ i: Schema.String, x: Schema.Int, y: Schema.Int, w: Schema.Int, h: Schema.Int })
const decodePlaced = Schema.decodeUnknownOption(Placed)
const decodeBox = Schema.decodeUnknownOption(Box)

/** What was saved, kept where it still reads: a card the console no longer offers, or a stray box, falls away. */
function boardOf(value: unknown): BoardPref {
  if (typeof value !== "object" || value === null) return BOARD_DEFAULT
  const v = value as Record<string, unknown>
  const widgets = Array.isArray(v.widgets)
    ? v.widgets.flatMap((w) => Option.toArray(decodePlaced(w)))
    : BOARD_DEFAULT.widgets
  const on = new Set(widgets.map((w) => w.id))
  const grid = Array.isArray(v.grid)
    ? v.grid.flatMap((b) => Option.toArray(decodeBox(b))).filter((b): b is GridBox => on.has(b.i as WidgetId))
    : BOARD_DEFAULT.grid.filter((b) => on.has(b.i))
  const engine = v.engine === "grid" ? "grid" : "masonry"
  const range = v.range === 7 || v.range === 90 ? v.range : 30
  return { widgets, grid, engine, range }
}

const same = (a: BoardPref, b: BoardPref) => JSON.stringify(a) === JSON.stringify(b)

const idsOf = (b: BoardPref) => b.widgets.map((w) => w.id).filter((id) => READ.has(id))

/**
 * The read the saved board needs, for the route's loader: its window, the cards `Home.widgets` fills, and whether
 * "Ongelezen chats" is on it (`Chats.list`).
 */
export function boardOfFrame(frame: Frame) {
  const b = boardOf(frame.prefs.sections.board?.value ?? BOARD_DEFAULT)
  return { range: b.range, ids: idsOf(b), chats: b.widgets.some((w) => w.id === "chats") }
}

/**
 * The board the design's components arrange (`useHome`), kept in the member's `board` preference: read into the store
 * before the board is drawn, and written back, a beat after the last change, when the person moves, sizes, colours,
 * adds or removes a card.
 */
export function useConsoleBoard(frame: Frame) {
  const [saved, save] = usePrefSection<unknown>(frame, "board", BOARD_DEFAULT)
  const board = useMemo(() => boardOf(saved), [saved])
  const current = useRef(board)
  const applying = useRef(false)

  // The saved board into the design's store; the board's engines only draw once mounted, so nothing flashes.
  useLayoutEffect(() => {
    current.current = board
    applying.current = true
    useHome.setState({ widgets: board.widgets, grid: board.grid, engine: board.engine })
    applying.current = false
  }, [board])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = useHome.subscribe((s, prev) => {
      if (applying.current) return
      if (s.widgets === prev.widgets && s.grid === prev.grid && s.engine === prev.engine) return
      const next = { ...current.current, widgets: s.widgets, grid: s.grid, engine: s.engine }
      if (same(next, current.current)) return
      current.current = next
      clearTimeout(timer)
      timer = setTimeout(() => save(current.current), 600)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [save])

  const setRange = (range: BoardRange) => {
    current.current = { ...current.current, range }
    save(current.current)
  }
  return { range: board.range, setRange, ids: idsOf(board), defaults: CONSOLE_LAYOUT }
}

/* ── the read ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `Home.widgets` for the board's cards and window. A changed board is a new read; until it is in, the last one stays
 * on screen, so adding a card does not blank the others.
 */
export function useHomeWidgets(range: BoardRange, ids: ReadonlyArray<WidgetId>) {
  const key = widgetsKey(range, ids)
  const result = useAtomValue(widgetsAtom(key))
  const refresh = useAtomRefresh(widgetsAtom(key))
  const value = Option.getOrUndefined(AsyncResult.value(result))
  const last = useRef<{ value: HomeWidgets; at: number } | undefined>(undefined)
  const [at, setAt] = useState(() => Date.now())
  useEffect(() => {
    if (value !== undefined) {
      last.current = { value, at: Date.now() }
      setAt(Date.now())
    }
  }, [value])
  const shown = value ?? last.current?.value
  return {
    data: shown,
    refresh: { refreshedAt: at, refreshing: result.waiting, refresh }
  }
}

/* ── the pulse ────────────────────────────────────────────────────────────────────────────────────── */

const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${
    Math.abs(n).toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits })
  }`
const one = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const share = (part: number, of: number) => (of === 0 ? 0 : (part / of) * 100)

/** The band's figures over `Home.widgets`' pulse, worded as the design's (`lib/home/pulse.ts`). */
export function pulseFigures(p: PulseFigures, days: number, currency: Currency): Array<PulseFigure> {
  const money = (n: number) => formatCurrency(n, currency).replace(/,00$/, "")
  const pct = (a: number, b: number, upGood = true) => {
    if (b === 0 || !p.comparable) return null
    const x = Math.round(((a - b) / b) * 1000) / 10
    return { text: `${signed(x, Math.abs(x) < 10 ? 1 : 0)}%`, good: x === 0 ? null : upGood ? x > 0 : x < 0 }
  }
  const out: Array<PulseFigure> = []
  if (p.revenue) {
    out.push({
      id: "revenue",
      label: "Omzet",
      value: p.revenue.value / 100,
      format: (n) => money(Math.round(n)),
      detail: `Betaalde bestellingen in de laatste ${days} dagen, zonder geannuleerde en terugbetaalde.`,
      delta: pct(p.revenue.value, p.revenue.previous),
      spark: p.revenue.spark.map((v) => v / 100),
      to: "/analytics"
    })
  }
  if (p.orders) {
    out.push({
      id: "orders",
      label: "Bestellingen",
      value: p.orders.value,
      format: (n) => Math.round(n).toLocaleString("nl-NL"),
      detail: `Bestellingen die meetellen in de laatste ${days} dagen.`,
      delta: pct(p.orders.value, p.orders.previous),
      spark: [...p.orders.spark],
      to: "/orders"
    })
  }
  if (p.tickets) {
    const t = p.tickets
    out.push({
      id: "tickets",
      label: "Open tickets",
      value: t.open,
      format: (n) => String(Math.round(n)),
      detail:
        `Nu open. ${t.created} nieuwe tickets in de laatste ${days} dagen, de verandering is op het aantal nieuwe.`,
      delta: t.createdBefore === 0 || !p.comparable
        ? null
        : {
          text: `${signed(Math.round(((t.created - t.createdBefore) / t.createdBefore) * 100))}%`,
          good: t.created === t.createdBefore ? null : t.created < t.createdBefore
        },
      spark: [...t.spark],
      to: "/tickets"
    })
  }
  if (p.ontime) {
    const o = p.ontime
    const a = share(o.onTime, o.delivered)
    const b = share(o.onTimeBefore, o.deliveredBefore)
    out.push({
      id: "ontime",
      label: "Op tijd geleverd",
      value: a,
      format: (n) => (o.delivered === 0 ? "—" : `${one(Math.round(n * 10) / 10)}%`),
      detail: `${o.delivered} ${
        o.delivered === 1 ? "pakket" : "pakketten"
      } bezorgd in de laatste ${days} dagen; op tijd is zonder vertraging.`,
      delta: o.delivered === 0 || o.deliveredBefore === 0 || !p.comparable
        ? null
        : { text: `${signed(Math.round((a - b) * 10) / 10, 1)} pt`, good: a === b ? null : a > b },
      spark: o.spark.map((v) => v ?? 0),
      to: "/analytics"
    })
  }
  if (p.reply) {
    const r = p.reply
    const a = r.replied === 0 ? 0 : r.minutes / r.replied / 60
    const b = r.repliedBefore === 0 ? 0 : r.minutesBefore / r.repliedBefore / 60
    const d = Math.round((a - b) * 10) / 10
    out.push({
      id: "reply",
      label: "Eerste reactie",
      value: a,
      format: (n) => (r.replied === 0 ? "—" : `${one(Math.round(n * 10) / 10)} u`),
      detail: `Gemiddelde tijd tot het eerste antwoord op een ticket; ${r.replied} ${
        r.replied === 1 ? "ticket" : "tickets"
      } beantwoord in de laatste ${days} dagen.`,
      delta: r.replied === 0 || r.repliedBefore === 0 || !p.comparable
        ? null
        : { text: `${signed(d, 1)} u`, good: d === 0 ? null : d < 0 },
      spark: r.spark.map((v) => v ?? 0),
      to: "/tickets"
    })
  }
  return out
}

/* ── the cards ────────────────────────────────────────────────────────────────────────────────────── */

const Quiet = ({ children }: { children: ReactNode }) => <p className="px-2 py-1 text-ink-3 text-sm">{children}</p>

const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["nl"], { type: "region" }) : undefined
const countryName = (code: string | null) => (code === null ? "Onbekend" : regions?.of(code) ?? code)

const isManual = Schema.is(ManualSetupTask)

/** "Waar dit getal vandaan komt", read when it is first opened and kept for the next. */
function ConsoleBreakdown(
  { open, onOpenChange, range, currency }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    range: BoardRange
    currency: Currency
  }
) {
  const b = Option.getOrUndefined(AsyncResult.value(useAtomValue(breakdownAtom(range))))
  if (b === undefined) return null
  return <BreakdownOf b={b} open={open} onOpenChange={onOpenChange} currency={currency} />
}

function BreakdownOf(
  { b, open, onOpenChange, currency }: {
    b: RevenueBreakdown
    open: boolean
    onOpenChange: (v: boolean) => void
    currency: Currency
  }
) {
  const notes = [
    b.rates.length > 0
      ? `Omgerekend naar ${b.currency} tegen de koers van de besteldag (${
        b.rates.map((r) => `${r.base} ${r.rate.toLocaleString("nl-NL", { maximumFractionDigits: 4 })}`).join(", ")
      }).`
      : null,
    b.unconverted > 0
      ? `${b.unconverted} ${
        b.unconverted === 1 ? "bestelling zonder wisselkoers telt" : "bestellingen zonder wisselkoers tellen"
      } niet mee.`
      : null
  ].filter((n) => n !== null)
  return (
    <RevenueBreakdownView
      open={open}
      onOpenChange={onOpenChange}
      total={b.totalMinor / 100}
      count={b.count}
      previous={b.previousMinor / 100}
      days={b.range}
      currency={currency}
      byStore={b.byStore.map((s) => ({ name: s.name, value: s.valueMinor / 100 }))}
      top={b.byProduct.map((p) => ({ title: p.title, units: p.units, value: p.valueMinor / 100 }))}
      rest={{ count: b.restCount, value: b.restMinor / 100 }}
      shipping={b.shippingTaxDiscountsMinor / 100}
      excluded={{ cancelled: b.excluded.cancelled, refunded: b.excluded.refunded }}
      rateNote={notes.length === 0 ? null : notes.join(" ")}
    />
  )
}

/** The revenue card's breakdown: mounted on first open, so the read only runs for someone who asks. */
function Breakdown(
  props: { open: boolean; onOpenChange: (v: boolean) => void; range: BoardRange; currency: Currency }
) {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (props.open) setAsked(true)
  }, [props.open])
  return asked || props.open ? <ConsoleBreakdown {...props} /> : null
}

function LiveCard({ live, currency }: { live: NonNullable<HomeWidgets["widgets"]["live"]>; currency: Currency }) {
  const [paused, setPaused] = useState(false)
  const held = useRef(live)
  if (!paused) held.current = live
  const shown = held.current
  return (
    <LiveView
      rows={shown.recent.map((o) => ({
        id: o.id,
        number: o.number,
        customer: o.customer,
        qty: o.qty,
        title: o.title,
        image: o.image ?? undefined,
        total: o.totalMinor / 100,
        currency: o.currency as Currency,
        country: o.country,
        at: o.at,
        to: `/orders/${o.id}`
      }))}
      today={{ count: shown.today.count, sum: shown.today.sumMinor / 100 }}
      auto
      paused={paused}
      onPause={setPaused}
      currency={currency}
    />
  )
}

/** The person's own list, over `Todos.*`; taking one off has Undo. */
function TodoCard() {
  const result = useAtomValue(todosAtom)
  const add = useAtomSet(todoWrites.add)
  const toggle = useAtomSet(todoWrites.toggle)
  const remove = useAtomSet(todoWrites.remove)
  const restore = useAtomSet(todoWrites.restore)
  const list = Option.getOrUndefined(AsyncResult.value(result))
  if (list === undefined) return <WidgetBones rows={3} />
  const todos: Array<Todo> = list.map((t) => ({
    id: t.id,
    text: t.text,
    done: t.done,
    ...(t.due === null ? {} : { due: t.due }),
    ...(t.doneAt === null ? {} : { doneAt: t.doneAt })
  }))
  const keys = [...TODOS]
  return (
    <TodoView
      todos={todos}
      onAdd={(text) => add({ payload: { text, due: null }, reactivityKeys: keys })}
      onToggle={(id) => toggle({ payload: { id }, reactivityKeys: keys })}
      onRemove={(id) => {
        remove({ payload: { id }, reactivityKeys: keys })
        undoable("Taak verwijderd", () => restore({ payload: { id }, reactivityKeys: keys }))
      }}
    />
  )
}

/**
 * Every offered card's body: the read's where it has one (a card the role may not read says so), the frame's for the
 * team and the recents, the queue's panel, the person's to-dos, and the setup checklist.
 */
export function useHomeSlots(
  { frame, data, range, queue, checklist }: {
    frame: Frame
    data: HomeWidgets | undefined
    range: BoardRange
    queue: ReactNode
    checklist: StartChecklist | undefined
  }
): Partial<Record<WidgetId, ReactNode>> {
  const presence = useAtomValue(presenceAtom)
  const complete = useAtomSet(completeTaskAtom)
  const currency = (data?.currency ?? "EUR") as Currency
  const w = data?.widgets

  /** The read's card: its bones until the read is in, a quiet line when the role may not read it. */
  const read = <K extends keyof NonNullable<typeof w>>(
    id: K,
    draw: (v: NonNullable<NonNullable<typeof w>[K]>) => ReactNode
  ) => {
    if (data === undefined) return <WidgetBones rows={3} />
    const v = w?.[id]
    return v === undefined
      ? <Quiet>Je rol kan dit niet inzien.</Quiet>
      : draw(v as NonNullable<NonNullable<typeof w>[K]>)
  }

  const team = frame.teammates
    .filter((t) => t.id !== frame.me.memberId)
    .map((t) => ({
      id: t.id,
      name: t.name,
      presence: presence.includes(t.id) ? "online" as const : "offline" as const
    }))
  const recent: Array<Shortcut> = frame.prefs.recents.map((r) => ({
    to: r.path,
    label: r.label,
    kind: r.kind as Shortcut["kind"],
    at: r.at
  }))
  const tasks = checklist === undefined ? undefined : consoleSetupTasks((id) => checklist.done.includes(id))
  const canOpenTask = useCanOpenTask()

  return {
    queue,
    revenue: read("revenue", (r) => (
      <RevenueView
        total={r.totalMinor / 100}
        change={r.change}
        points={r.points.map((p) => ({
          label: new Intl.DateTimeFormat("nl-NL", { month: "short", day: "numeric" }).format(
            new Date(`${p.day}T12:00:00`)
          ),
          value: p.valueMinor / 100,
          orders: p.orders
        }))}
        range={range}
        currency={currency}
        breakdown={(open, onOpenChange) => (
          <Breakdown open={open} onOpenChange={onOpenChange} range={range} currency={currency} />
        )}
      />
    )),
    orders: read("orders", (o) => <OrdersView stages={o.stages} delayed={o.delayed} />),
    chargebacks: read("chargebacks", (c) => (
      <ChargebacksView
        open={c.open}
        atStake={c.atStakeMinor / 100}
        currency={currency}
        won={c.won}
        decided={c.decided}
        submitted={c.submitted}
        nearest={c.nearest}
      />
    )),
    suppliers: read("suppliers", (s) => <SuppliersView rows={s.rows} />),
    tickets: read("tickets", (t) => <TicketsView columns={t.columns} high={t.high} />),
    mytickets: read("mytickets", (m) => <MyTicketsView rows={m.rows} total={m.total} />),
    stock: read("stock", (s) => (
      <StockView
        rows={s.rows.map((r) => ({
          id: r.variantId,
          product: r.product,
          productId: r.productId,
          variant: r.variant,
          sku: r.sku,
          left: r.left
        }))}
      />
    )),
    returns: read("returns", (r) => <ReturnsView rows={r.rows} />),
    live: read("live", (l) => <LiveCard live={l} currency={currency} />),
    bestsellers: read("bestsellers", (b) => (
      <BestsellersView
        rows={b.rows.map((r) => ({
          id: r.productId,
          title: r.title,
          image: r.image ?? undefined,
          units: r.units,
          revenue: r.revenueMinor / 100,
          stock: r.stock
        }))}
        currency={currency}
      />
    )),
    countries: read("countries", (c) => (
      <CountriesView
        rows={c.rows.map((r) => ({ country: r.country, name: countryName(r.country), n: r.orders }))}
        range={range}
        analyse={false}
      />
    )),
    team: team.length === 0 ? <Quiet>Je bent hier nog alleen.</Quiet> : <TeamView team={team} message />,
    recent: <RecentView recent={recent} />,
    today: <ConsoleToday />,
    mentions: <ConsoleMentions />,
    chats: <ConsoleChats />,
    bookmarks: <ConsoleBookmarks />,
    todo: <TodoCard />,
    setup: tasks === undefined ? <WidgetBones rows={4} /> : (
      <SetupView
        tasks={tasks}
        canOpen={canOpenTask}
        onToggle={(id) => {
          if (!isManual(id) || checklist === undefined) return
          complete({ payload: { task: id, done: !checklist.done.includes(id) }, reactivityKeys: START })
        }}
      />
    )
  }
}

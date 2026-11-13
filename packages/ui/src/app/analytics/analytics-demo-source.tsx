import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import { SUGGESTED } from "../lib/analytics/ask"
import {
  daily,
  dec1,
  type Finding,
  findings as findingsOf,
  isLate,
  leadTimes,
  metrics,
  money,
  type Month,
  MONTHS,
  num,
  pct,
  round1,
  type Span,
  spans,
  WEEKDAYS
} from "../lib/analytics/engine"
import {
  COUNTRY_NAME,
  DISPUTE_REASON_LABEL,
  type DisputeReason,
  type HistOrder,
  HISTORY,
  REFUND_REASON_LABEL,
  type RefundReason,
  STORE_NAME,
  TICKET_TOPIC_LABEL
} from "../lib/analytics/history"
import { type Explanation, useAnalytics } from "../stores/analytics-store"
import type {
  AnalyticsSource,
  ChartKind,
  ChartsView,
  DrawerView,
  DriverView,
  FigureView,
  FindingView,
  RecordView
} from "./analytics-source"
import { AnalyticsSourceProvider } from "./analytics-source"
import { AnswerList, useAnswers } from "./ask-bar"
import { fileProposal } from "./file-proposal"

/*
 * Analyse in the design app: everything computed from the analytics history (`lib/analytics`), five months up to 26
 * May 2026, in dollars. The periods and what was decided on Insyte's proposals live in the analytics store; the number
 * being explained is the store's, and its orders are paged here, forty at a time, as before there was a source.
 */

const explain = (e: Explanation | null) => useAnalytics.getState().explain(e)

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
const dayName = (s: Span, d: number) => `${d} ${s.abbr}`
function by<T>(xs: ReadonlyArray<T>, key: (x: T) => string) {
  const g = new Map<string, Array<T>>()
  for (const x of xs) g.set(key(x), [...(g.get(key(x)) ?? []), x])
  return g
}
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)

const kilo = (v: number) => {
  const n = v / 1000
  return `$${Number.isInteger(n) ? n : dec1(n)}k`
}

function formatDriver(v: number, unit: Explanation["unit"]) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : ""
  const abs = Math.abs(v)
  if (unit === "$") return `${sign}${money(abs)}`
  if (unit === "h") return `${sign}${dec1(abs)} u`
  if (unit === "pts") return `${sign}${abs.toLocaleString("nl-NL")} pp`
  return `${sign}${abs.toLocaleString("nl-NL")}`
}

/** The chart a finding is drawn with. */
const chartOf = (f: Finding): ChartKind =>
  f.focus.chart === "heatmap" ? "revenue" : f.focus.chart === "delivery" ? "leadtime" : f.focus.chart

const litOf = (f: Finding) =>
  f.focus.chart === "leadtime" ?
    f.focus.supplier :
    f.focus.chart === "refunds" || f.focus.chart === "disputes" ?
    f.focus.reason :
    undefined

function openFinding(f: Finding, A: Span, B: Span) {
  explain({
    title: f.metric,
    value: f.figure,
    compare: `${A.short} tegenover ${B.short}`,
    text: f.explain,
    drivers: f.drivers,
    unit: f.driverUnit,
    records: f.records
  })
}

/* ── The drawer ─────────────────────────────────────────────────────────────────────────────── */

const PAGE = 40

const dayLabel = (d: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`)
  )

function recordOf(o: HistOrder): RecordView {
  const late = o.took !== undefined ? o.took - o.promised : 0
  const [outcome, tone] = o.status === "refunded" ?
    [`Terugbetaald · ${o.refundReason ? REFUND_REASON_LABEL[o.refundReason] : ""}`, "red" as const] :
    o.status === "cancelled" ?
    ["Geannuleerd", "muted" as const] :
    o.status === "in_transit" ?
    ["Onderweg", "plain" as const] :
    late > 0 ?
    [`${late} ${late === 1 ? "dag" : "dagen"} te laat`, "amber" as const] :
    ["Op tijd", "plain" as const]
  return {
    id: o.id,
    number: o.number,
    day: dayLabel(o.day),
    item: `${o.qty > 1 ? `${o.qty} × ` : ""}${o.title}`,
    country: COUNTRY_NAME[o.country],
    store: STORE_NAME[o.store] ?? o.store,
    outcome,
    tone,
    total: money(o.total)
  }
}

function useDrawer(): DrawerView | null {
  const e = useAnalytics((s) => s.explaining)
  const key = e ? `${e.title}:${e.value}:${e.compare}` : ""
  const [paged, setPaged] = useState({ key: "", limit: PAGE })
  const limit = paged.key === key ? paged.limit : PAGE
  const sorted = useMemo(() => e ? e.records.toSorted((x, y) => y.at.localeCompare(x.at)) : [], [e])
  const records = useMemo(() => sorted.slice(0, limit).map(recordOf), [sorted, limit])
  if (e === null) return null
  const drivers: Array<DriverView> = e.drivers.map((d) => ({ ...d, shown: formatDriver(d.value, e.unit) }))
  return {
    key,
    title: e.title,
    value: e.value,
    compare: e.compare,
    text: e.text,
    drivers,
    records,
    total: sorted.length,
    more: { load: () => setPaged({ key, limit: limit + PAGE }), loading: false },
    open: e.open
  }
}

/* ── What a click opens ─────────────────────────────────────────────────────────────────────── */

function openDay(A: Span, B: Span, day: number) {
  const on = (s: Span) => (o: HistOrder) => o.day === `${s.month}-${String(day).padStart(2, "0")}`
  const oa = metrics(A).counted.filter(on(A))
  const ob = metrics(B).counted.filter(on(B))
  const va = oa.reduce((n, o) => n + o.total, 0)
  const vb = ob.reduce((n, o) => n + o.total, 0)
  const ga = by(oa, (o) => o.store)
  const gb = by(ob, (o) => o.store)
  const drivers = [...new Set([...ga.keys(), ...gb.keys()])]
    .map((k) => ({
      label: STORE_NAME[k] ?? k,
      value: Math.round(
        (ga.get(k) ?? []).reduce((n, o) => n + o.total, 0) - (gb.get(k) ?? []).reduce((n, o) => n + o.total, 0)
      )
    }))
    .toSorted((x, y) => Math.abs(y.value) - Math.abs(x.value))
  explain({
    title: `Omzet op ${dayName(A, day)}`,
    value: money(va),
    compare: `tegenover ${money(vb)} op ${dayName(B, day)}`,
    text: `${oa.length} ${oa.length === 1 ? "betaalde bestelling bracht" : "betaalde bestellingen brachten"} op ${
      dayName(A, day)
    } ${money(va)} op, ${dec1(Math.abs(pct(va, vb)))}% ${
      pct(va, vb) >= 0 ? "meer" : "minder"
    } dan op dezelfde dag in ${B.label}.`,
    drivers,
    unit: "$",
    records: oa,
    open: { label: "Bestellingen openen", to: "/orders" }
  })
}

function openSupplier(A: Span, key: string) {
  const r = leadTimes(A).find((x) => x.key === key)
  if (!r) return
  const late = r.rows.filter(isLate)
  const g = by(late, (o) => o.country)
  explain({
    title: `${r.label}, te late pakketten`,
    value: `${num(round1((late.length / r.rows.length) * 100))}%`,
    compare: `van ${r.rows.length.toLocaleString("nl-NL")} bezorgd in ${A.label}`,
    text: `${late.length} van de ${
      r.rows.length.toLocaleString("nl-NL")
    } pakketten van ${r.label} kwamen na de beloofde datum aan.`,
    drivers: [...g]
      .map(([c, xs]) => ({ label: COUNTRY_NAME[c as keyof typeof COUNTRY_NAME], value: xs.length }))
      .toSorted((p, q) => q.value - p.value),
    unit: "orders",
    records: late
  })
}

function openRefundReason(A: Span, B: Span, key: string) {
  const a = metrics(A)
  const b = metrics(B)
  const reason = REFUND_REASON_LABEL[key as RefundReason] ?? key
  const ra = a.refunds.filter((o) => o.refundReason === key)
  const rb = b.refunds.filter((o) => o.refundReason === key)
  const ga = by(ra, (o) => o.title)
  const gb = by(rb, (o) => o.title)
  explain({
    title: `Terugbetalingen wegens “${reason}”`,
    value: String(ra.length),
    compare: `tegenover ${rb.length} in ${B.short}`,
    text: `In ${A.label} ${ra.length === 1 ? "kwam" : "kwamen"} ${ra.length} ${
      ra.length === 1 ? "bestelling" : "bestellingen"
    } terug wegens “${reason}”, tegenover ${rb.length} in ${B.label}.`,
    drivers: [...new Set([...ga.keys(), ...gb.keys()])]
      .map((k) => ({
        label: k,
        value: (ga.get(k)?.length ?? 0) - (gb.get(k)?.length ?? 0),
        detail: `${gb.get(k)?.length ?? 0} → ${ga.get(k)?.length ?? 0}`
      }))
      .toSorted((x, y) => Math.abs(y.value) - Math.abs(x.value))
      .slice(0, 6),
    unit: "refunds",
    records: ra
  })
}

function openDisputeReason(A: Span, B: Span, key: string) {
  const a = metrics(A)
  const b = metrics(B)
  const reason = DISPUTE_REASON_LABEL[key as DisputeReason] ?? key
  const ds = a.disputes.filter((d) => d.reason === key)
  const ids = new Set(ds.map((d) => d.order))
  explain({
    title: `Geschillen wegens “${reason}”`,
    value: String(ds.length),
    compare: `tegenover ${b.disputes.filter((d) => d.reason === key).length} in ${B.short}`,
    text: `In ${A.label} ${
      ds.length === 1 ? "is 1 geschil" : `zijn ${ds.length} geschillen`
    } geopend wegens “${reason}”, samen ${money(ds.reduce((n, d) => n + d.amount, 0))}.`,
    drivers: [],
    unit: "cases",
    records: HISTORY.orders.filter((o) => ids.has(o.id)),
    open: { label: "Geschillen openen", to: "/chargebacks" }
  })
}

const hoursOn = (m: ReturnType<typeof metrics>, w: number) => {
  const t = m.tickets.filter((x) => x.weekday === w)
  return t.length === 0 ? 0 : round1(t.reduce((n, x) => n + x.resolveH, 0) / t.length)
}

function openWeekday(A: Span, w: number) {
  const a = metrics(A)
  const ts = a.tickets.filter((t) => t.weekday === w)
  const h = hoursOn(a, w)
  explain({
    title: `Tickets op ${WEEKDAYS[w]}`,
    value: `${num(h)} u`,
    compare: `tot opgelost, tegenover ${num(a.resolveH)} u over de hele week`,
    text: `In ${A.label} ${ts.length === 1 ? "kwam 1 ticket" : `kwamen ${ts.length} tickets`} op ${
      WEEKDAYS[w]
    } binnen, gemiddeld na ${num(h)} u opgelost.${
      w === 0 || w === 6 ? " In het weekend heeft niemand dienst, dus die wachten tot maandag." : ""
    }`,
    drivers: [...by(ts, (t) => TICKET_TOPIC_LABEL[t.topic])]
      .map(([k, xs]) => ({ label: k, value: xs.length }))
      .toSorted((p, q) => q.value - p.value),
    unit: "cases",
    records: [],
    open: { label: "Tickets openen", to: "/tickets" }
  })
}

function openPaidOrders(A: Span, B: Span) {
  const a = metrics(A)
  const b = metrics(B)
  const count = (m: typeof a) => {
    const g = new Map<string, number>()
    for (const o of m.counted) g.set(o.store, (g.get(o.store) ?? 0) + 1)
    return g
  }
  const ga = count(a)
  const gb = count(b)
  explain({
    title: "Betaalde bestellingen",
    value: a.counted.length.toLocaleString("nl-NL"),
    compare: `tegenover ${b.counted.length.toLocaleString("nl-NL")} in ${B.short}`,
    text: `In ${A.label} werden ${
      a.counted.length.toLocaleString("nl-NL")
    } bestellingen betaald en gehouden, gemiddeld ${money(a.aov)}, tegenover ${
      b.counted.length.toLocaleString("nl-NL")
    } van gemiddeld ${money(b.aov)} in ${B.label}.`,
    drivers: [...new Set([...ga.keys(), ...gb.keys()])].map((k) => ({
      label: STORE_NAME[k] ?? k,
      value: (ga.get(k) ?? 0) - (gb.get(k) ?? 0),
      detail: `${gb.get(k) ?? 0} → ${ga.get(k) ?? 0}`
    })),
    unit: "orders",
    records: a.counted,
    open: { label: "Bestellingen openen", to: "/orders" }
  })
}

/* ── The page's data ────────────────────────────────────────────────────────────────────────── */

function figuresOf(A: Span, B: Span, byId: Record<string, Finding>): Array<FigureView> {
  const a = metrics(A)
  const b = metrics(B)
  const finding = (id: string) => () => {
    const f = byId[id]
    if (f) openFinding(f, A, B)
  }
  return [
    {
      id: "revenue",
      label: "Omzet",
      value: money(a.revenue),
      before: money(b.revenue),
      delta: pct(a.revenue, b.revenue),
      unit: "%",
      goodWhenUp: true,
      available: true,
      open: finding("revenue")
    },
    {
      id: "paid_orders",
      label: "Betaalde bestellingen",
      value: a.counted.length.toLocaleString("nl-NL"),
      before: b.counted.length.toLocaleString("nl-NL"),
      delta: pct(a.counted.length, b.counted.length),
      unit: "%",
      goodWhenUp: true,
      available: true,
      open: () => openPaidOrders(A, B)
    },
    {
      id: "on_time",
      label: "Op tijd",
      value: `${num(a.onTime)}%`,
      before: `${num(b.onTime)}%`,
      delta: round1(a.onTime - b.onTime),
      unit: " pp",
      goodWhenUp: true,
      available: true,
      open: finding("delivery")
    },
    {
      id: "refund_rate",
      label: "Terugbetaald",
      value: `${num(round1(a.refundRate))}%`,
      before: `${num(round1(b.refundRate))}%`,
      delta: round1(a.refundRate - b.refundRate),
      unit: " pp",
      goodWhenUp: false,
      available: true,
      open: finding("refunds")
    },
    {
      id: "disputes",
      label: "Geschillen",
      value: String(a.disputes.length),
      before: String(b.disputes.length),
      delta: a.disputes.length - b.disputes.length,
      unit: "",
      digits: 0,
      goodWhenUp: false,
      available: true,
      open: finding("disputes")
    },
    {
      id: "resolve_hours",
      label: "Uren tot opgelost",
      value: `${num(a.resolveH)} u`,
      before: `${num(b.resolveH)} u`,
      delta: pct(a.resolveH, b.resolveH),
      unit: "%",
      goodWhenUp: false,
      available: true,
      open: finding("support")
    }
  ]
}

/** Each reason with how many in each period, most in this one first. */
function reasons<K extends string>(xa: ReadonlyArray<K>, xb: ReadonlyArray<K>, label: Record<K, string>) {
  return [...new Set([...xa, ...xb])]
    .map((r) => ({
      key: r,
      label: label[r],
      a: xa.filter((x) => x === r).length,
      b: xb.filter((x) => x === r).length
    }))
    .toSorted((x, y) => y.a - x.a)
}

function chartsOf(A: Span, B: Span): ChartsView {
  const a = metrics(A)
  const b = metrics(B)
  return {
    daily: daily(A, B).map((p) => ({
      day: p.day,
      revenue: p.revenue,
      revenuePrev: p.revenuePrev,
      forecast: p.forecast,
      band: p.band
    })),
    leadTimes: leadTimes(A).map((r) => ({
      key: r.key,
      label: r.label,
      dots: r.rows
        .filter((o) => hash(o.id) % Math.max(1, Math.ceil(r.rows.length / 240)) === 0)
        .map((o) => ({ id: o.id, d: o.took! - o.promised })),
      late: round1((r.late / r.rows.length) * 100)
    })),
    refunds: reasons(
      a.refunds.map((o) => o.refundReason!),
      b.refunds.map((o) => o.refundReason!),
      REFUND_REASON_LABEL
    ),
    disputes: reasons(a.disputes.map((d) => d.reason), b.disputes.map((d) => d.reason), DISPUTE_REASON_LABEL),
    support: [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      w,
      label: cap(WEEKDAYS[w]!.slice(0, 2)),
      a: hoursOn(a, w),
      b: hoursOn(b, w)
    }))
  }
}

const RUNNING: Partial<Record<Month, string>> = { "2026-05": "tot 26 mei" }
const MONTH_LIST = MONTHS.map((m) => ({ id: m.id, label: m.label, running: RUNNING[m.id] }))

function useDemoAnalyticsSource(): AnalyticsSource {
  const a = useAnalytics((s) => s.a)
  const b = useAnalytics((s) => s.b)
  const setPeriods = useAnalytics((s) => s.setPeriods)
  const decided = useAnalytics((s) => s.decided)
  const decide = useAnalytics((s) => s.decide)
  const navigate = useNavigate()
  const { A, B } = useMemo(() => spans(a, b), [a, b])
  const { answers, ask, dismiss } = useAnswers(A, B)
  const drawer = useDrawer()

  const all = useMemo(() => findingsOf(A, B), [A, B])
  const byId = useMemo(() => Object.fromEntries(all.map((f) => [f.id, f])), [all])
  const figures = useMemo(() => figuresOf(A, B, byId), [A, B, byId])
  const charts = useMemo(() => chartsOf(A, B), [A, B])

  const findings = useMemo(
    () =>
      all.map((f): FindingView => {
        const key = `${A.from}:${B.from}:${f.id}`
        const p = f.proposal
        return {
          id: f.id,
          metric: f.metric,
          tone: f.tone,
          headline: f.headline,
          chart: chartOf(f),
          lit: litOf(f),
          open: () => openFinding(f, A, B),
          proposal: p && {
            title: p.title,
            why: p.why,
            fileLabel: p.fileLabel,
            decision: decided[key],
            file: () => {
              const done = fileProposal(p.action)
              decide(key, "filed")
              toast(
                done.message,
                done.to ? { action: { label: "Openen", onClick: () => navigate({ to: done.to as never }) } } : undefined
              )
            },
            discard: () => decide(key, "discarded"),
            undo: () => decide(key, null)
          }
        }
      }),
    [all, A, B, decided, decide, navigate]
  )

  const answered: ReactNode = answers.length > 0 ?
    <AnswerList answers={answers} onAsk={ask} onDismiss={dismiss} /> :
    undefined

  return {
    months: MONTH_LIST,
    a,
    b,
    setPeriods: (x, y) => setPeriods(x as Month, y as Month),
    A: { label: A.label, short: A.short, abbr: A.abbr },
    B: { label: B.label, short: B.short, abbr: B.abbr },
    empty: HISTORY.orders.length === 0 ?
      { action: { label: "Synchronisatie bekijken", to: "/data", search: { view: "sync" } } } :
      undefined,
    figures,
    footnote: `Berekend uit ${
      HISTORY.orders.length.toLocaleString("nl-NL")
    } bestellingen sinds 1 januari, met hun leveringen, terugbetalingen en geschillen, en ${
      HISTORY.tickets.length.toLocaleString("nl-NL")
    } tickets.`,
    findings,
    charts,
    openDay: (day) => openDay(A, B, day),
    openSupplier: (key) => openSupplier(A, key),
    openRefundReason: (key) => openRefundReason(A, B, key),
    openDisputeReason: (key) => openDisputeReason(A, B, key),
    openWeekday: (w) => openWeekday(A, w),
    drawer,
    closeDrawer: () => explain(null),
    money,
    kilo,
    ask: { suggested: SUGGESTED, submit: ask, answers: answered }
  }
}

export function DemoAnalyticsSource({ children }: { children: ReactNode }) {
  return <AnalyticsSourceProvider value={useDemoAnalyticsSource()}>{children}</AnalyticsSourceProvider>
}

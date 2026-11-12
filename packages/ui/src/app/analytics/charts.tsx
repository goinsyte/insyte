import { useReducedMotion } from "motion/react"
import { type ReactNode, useId, useMemo } from "react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import type { AnswerChart } from "../lib/analytics/ask"
import {
  daily,
  dec1,
  isLate,
  leadTimes,
  metrics,
  money,
  num,
  pct,
  round1,
  type Span,
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
import { cn } from "../lib/utils"
import { ChartBones } from "../loading/page-skeletons"
import { Stream } from "../loading/stream"
import { useAnalytics } from "../stores/analytics-store"

/**
 * The charts a finding carries. Bare — no card, no title, no legend beyond what a dashed line
 * needs — because the sentence above each one is its title. Every mark opens the drawer.
 */

const AXIS = { tick: { fontSize: 12, fill: "var(--ink-3)" }, tickLine: false, axisLine: false } as const
const anim = (still: boolean | null) => ({
  isAnimationActive: !still,
  animationDuration: 600,
  animationEasing: "ease-out" as const
})
const dayName = (s: Span, d: number) => `${d} ${s.abbr}`
const kilo = (v: unknown) => {
  const n = Number(v) / 1000
  return `$${Number.isInteger(n) ? n : dec1(n)}k`
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
function by<T>(xs: T[], key: (x: T) => string) {
  const g = new Map<string, T[]>()
  for (const x of xs) g.set(key(x), [...(g.get(key(x)) ?? []), x])
  return g
}

function Tip({
  active,
  payload,
  label,
  rows
}: {
  active?: boolean
  payload?: ReadonlyArray<{ value?: unknown; dataKey?: unknown }>
  label?: unknown
  rows: (p: ReadonlyArray<{ value?: unknown; dataKey?: unknown }>) => Array<[string, string]>
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="panel-raised flex min-w-36 flex-col gap-1 rounded-lg px-3 py-2 text-sm">
      <span className="font-medium text-ink">{String(label)}</span>
      {rows(payload).map(([k, v]) => (
        <span key={k} className="flex justify-between gap-4 text-ink-2">
          {k}
          <span className="text-ink tabular-nums">{v}</span>
        </span>
      ))}
    </div>
  )
}

/* ── Revenue by day ─────────────────────────────────────────────────────────────────────────── */

export function RevenueChart({ A, B }: { A: Span; B: Span }) {
  const still = useReducedMotion()
  const explain = useAnalytics((s) => s.explain)
  const data = useMemo(
    () => daily(A, B).map((p) => ({ ...p, low: p.band?.[0], spread: p.band ? p.band[1] - p.band[0] : undefined })),
    [A, B]
  )
  const forecast = data.some((p) => p.forecast !== undefined && p.revenue === null)

  function open(i: number) {
    const p = data[i]
    if (!p || p.revenue === null) return
    const on = (s: Span) => (o: HistOrder) => o.day === `${s.month}-${String(p.day).padStart(2, "0")}`
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
      .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
    explain({
      title: `Omzet op ${dayName(A, p.day)}`,
      value: money(va),
      compare: `tegenover ${money(vb)} op ${dayName(B, p.day)}`,
      text: `${oa.length} ${oa.length === 1 ? "betaalde bestelling bracht" : "betaalde bestellingen brachten"} op ${
        dayName(A, p.day)
      } ${money(va)} op, ${dec1(Math.abs(pct(va, vb)))}% ${
        pct(va, vb) >= 0 ? "meer" : "minder"
      } dan op dezelfde dag in ${B.label}.`,
      drivers,
      unit: "$",
      records: oa,
      open: { label: "Bestellingen openen", to: "/orders" }
    })
  }

  return (
    <figure className="flex flex-col gap-1">
      <div className="h-[200px]">
        <ClientChart>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onClick={(st) => open(Number(st?.activeTooltipIndex ?? -1))}
              className="cursor-pointer"
            >
              <defs>
                <linearGradient id="rev-a" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--arc)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--arc)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                {...AXIS}
                interval="preserveStartEnd"
                minTickGap={48}
                tickFormatter={(v) => dayName(A, Number(v))}
              />
              <YAxis {...AXIS} width={44} tickFormatter={kilo} />
              <Tooltip
                cursor={{ stroke: "var(--arc)", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={(p) => (
                  <Tip
                    {...p}
                    label={dayName(A, Number(p.label))}
                    rows={(pl) =>
                      pl
                        .filter((x) =>
                          (x.dataKey === "revenue" || x.dataKey === "revenuePrev" || x.dataKey === "forecast") &&
                          typeof x.value === "number"
                        )
                        .map((
                          x
                        ) => [
                          x.dataKey === "revenue" ? A.short : x.dataKey === "forecast" ? "Schatting" : B.short,
                          money(Number(x.value))
                        ])}
                  />
                )}
              />
              <Area dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area
                dataKey="spread"
                stackId="band"
                stroke="none"
                fill="var(--arc)"
                fillOpacity={0.1}
                {...anim(still)}
              />
              <Line
                dataKey="revenuePrev"
                stroke="var(--ink-4)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
                dot={false}
                {...anim(still)}
              />
              <Area
                dataKey="revenue"
                stroke="var(--arc)"
                strokeWidth={2}
                fill="url(#rev-a)"
                dot={false}
                activeDot={{ r: 4 }}
                {...anim(still)}
              />
              <Line
                dataKey="forecast"
                stroke="var(--arc)"
                strokeWidth={1.25}
                strokeDasharray="2 4"
                dot={false}
                {...anim(still)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ClientChart>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 pl-11 text-ink-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 bg-arc" />
          {A.short}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-3.5 border-ink-4 border-t-[1.5px] border-dashed" />
          {B.short}
        </span>
        {forecast ?
          (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-3.5 rounded-[2px] bg-arc/12" />
              Schatting van Insyte voor de rest van de maand
            </span>
          ) :
          null}
      </figcaption>
    </figure>
  )
}

/* ── Days against the promise ───────────────────────────────────────────────────────────────── */

const LT_MIN = -3
const LT_MAX = 7
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Every delivered parcel as a dot, by how early or late it was, one row per supplier. */
export function LeadTimeChart({ A, lit }: { A: Span; lit?: string }) {
  const explain = useAnalytics((s) => s.explain)
  const rows = useMemo(() => leadTimes(A), [A])
  const x = (v: number) => ((Math.max(LT_MIN, Math.min(LT_MAX, v)) - LT_MIN) / (LT_MAX - LT_MIN)) * 100
  return (
    <figure className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const sample = r.rows.filter((o) => hash(o.id) % Math.max(1, Math.ceil(r.rows.length / 240)) === 0)
        const on = lit === undefined || lit === r.key
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => {
              const late = r.rows.filter(isLate)
              const g = by(late, (o) => o.country)
              explain({
                title: `${r.label}, te late pakketten`,
                value: `${num(round1((late.length / r.rows.length) * 100))}%`,
                compare: `van ${r.rows.length.toLocaleString("nl-NL")} bezorgd in ${A.label}`,
                text: `${late.length} van de ${
                  r.rows.length.toLocaleString("nl-NL")
                } pakketten van ${r.label} kwamen na de beloofde datum aan.`,
                drivers: [...g].map(([c, xs]) => ({
                  label: COUNTRY_NAME[c as keyof typeof COUNTRY_NAME],
                  value: xs.length
                })).sort((p, q) => q.value - p.value),
                unit: "orders",
                records: late
              })
            }}
            className="group grid cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md py-1.5 text-left sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]"
          >
            <span className={cn("truncate text-sm", on ? "text-ink" : "text-ink-2")}>{r.label}</span>
            <span
              className={cn(
                "relative h-8 transition-opacity group-hover:opacity-100",
                on ? "opacity-100" : "opacity-35"
              )}
            >
              <span aria-hidden className="absolute top-0 bottom-0 w-px bg-ink/30" style={{ left: `${x(0)}%` }} />
              {sample.map((o) => {
                const d = o.took! - o.promised
                const jx = (hash(o.id) % 100) / 100
                const jy = (hash(`${o.id}y`) % 100) / 100
                return (
                  <span
                    key={o.id}
                    aria-hidden
                    className={cn(
                      "absolute size-1.5 rounded-full",
                      d > 1 ? "bg-signal-red/70" : d > 0 ? "bg-signal-amber/70" : "bg-ink/18"
                    )}
                    style={{ left: `calc(${x(d + (jx - 0.5) * 0.8)}% - 3px)`, top: `${4 + jy * 22}px` }}
                  />
                )
              })}
            </span>
            <span
              className={cn(
                "text-right text-sm tabular-nums",
                r.late / r.rows.length > 0.1 ? "font-medium text-signal-red" : "text-ink-2"
              )}
            >
              {num(round1((r.late / r.rows.length) * 100))}%
            </span>
          </button>
        )
      })}
      <figcaption className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] gap-3 text-ink-3 text-xs sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
        <span />
        <span className="relative h-4">
          {[-2, 0, 2, 4, 6].map((d) => (
            <span key={d} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${x(d)}%` }}>
              {d === 0 ? "beloofd" : d > 0 ? `+${d}d` : `${d}d`}
            </span>
          ))}
        </span>
        <span className="text-right">te laat</span>
      </figcaption>
    </figure>
  )
}

/* ── Reasons: refunds and disputes ──────────────────────────────────────────────────────────── */

function Reasons({
  rows,
  lit,
  onPick,
  A,
  B
}: {
  rows: Array<{ key: string; label: string; a: number; b: number }>
  lit?: string
  onPick: (r: string) => void
  A: Span
  B: Span
}) {
  const still = useReducedMotion()
  return (
    <figure className="flex flex-col gap-1">
      <div style={{ height: 16 + rows.length * 30 }}>
        <ClientChart>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              barGap={2}
              barCategoryGap="26%"
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...AXIS} width={124} />
              <Tooltip
                cursor={{ fill: "color-mix(in oklch, var(--ink) 4%, transparent)" }}
                content={(p) => (
                  <Tip
                    {...p}
                    rows={(pl) => pl.map((x) => [x.dataKey === "a" ? A.short : B.short, String(x.value)])}
                  />
                )}
              />
              <Bar
                dataKey="b"
                fill="var(--ink-5)"
                radius={2}
                {...anim(still)}
                cursor="pointer"
                onClick={(d) => onPick(String((d as { key?: string }).key))}
              />
              <Bar
                dataKey="a"
                radius={2}
                {...anim(still)}
                cursor="pointer"
                onClick={(d) => onPick(String((d as { key?: string }).key))}
              >
                {rows.map((r) => (
                  <Cell
                    key={r.key}
                    fill={lit === undefined || lit === r.key
                      ? "var(--arc)"
                      : "color-mix(in oklch, var(--arc) 35%, transparent)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ClientChart>
      </div>
      <figcaption className="flex gap-4 pl-[132px] text-ink-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-arc" />
          {A.short}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-ink-5" />
          {B.short}
        </span>
      </figcaption>
    </figure>
  )
}

export function RefundsChart({ A, B, lit }: { A: Span; B: Span; lit?: string }) {
  const explain = useAnalytics((s) => s.explain)
  const a = metrics(A)
  const b = metrics(B)
  const rows = useMemo(() => {
    const reasons = [...new Set([...a.refunds, ...b.refunds].map((o) => o.refundReason!))]
    return reasons
      .map((r) => ({
        key: r,
        label: REFUND_REASON_LABEL[r],
        a: a.refunds.filter((o) => o.refundReason === r).length,
        b: b.refunds.filter((o) => o.refundReason === r).length
      }))
      .sort((x, y) => y.a - x.a)
  }, [a, b])
  return (
    <Reasons
      A={A}
      B={B}
      rows={rows}
      lit={lit}
      onPick={(key) => {
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
            .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
            .slice(0, 6),
          unit: "refunds",
          records: ra
        })
      }}
    />
  )
}

export function DisputesChart({ A, B, lit }: { A: Span; B: Span; lit?: string }) {
  const explain = useAnalytics((s) => s.explain)
  const a = metrics(A)
  const b = metrics(B)
  const rows = useMemo(() => {
    const reasons = [...new Set([...a.disputes, ...b.disputes].map((d) => d.reason))]
    return reasons
      .map((r) => ({
        key: r,
        label: DISPUTE_REASON_LABEL[r],
        a: a.disputes.filter((d) => d.reason === r).length,
        b: b.disputes.filter((d) => d.reason === r).length
      }))
      .sort((x, y) => y.a - x.a)
  }, [a, b])
  return (
    <Reasons
      A={A}
      B={B}
      rows={rows}
      lit={lit}
      onPick={(key) => {
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
      }}
    />
  )
}

/* ── Support by weekday ─────────────────────────────────────────────────────────────────────── */

export function SupportChart({ A, B }: { A: Span; B: Span }) {
  const still = useReducedMotion()
  const explain = useAnalytics((s) => s.explain)
  const a = metrics(A)
  const b = metrics(B)
  const data = useMemo(() => {
    const h = (m: typeof a, w: number) => {
      const t = m.tickets.filter((x) => x.weekday === w)
      return t.length === 0 ? 0 : round1(t.reduce((n, x) => n + x.resolveH, 0) / t.length)
    }
    return [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      w,
      label: cap(WEEKDAYS[w]!.slice(0, 2)),
      a: h(a, w),
      b: h(b, w),
      n: a.tickets.filter((x) => x.weekday === w).length
    }))
  }, [a, b])
  return (
    <figure className="h-[180px]">
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={32} tickFormatter={(v) => `${v} u`} />
            <Tooltip
              cursor={{ fill: "color-mix(in oklch, var(--ink) 4%, transparent)" }}
              content={(p) => (
                <Tip
                  {...p}
                  rows={(pl) => pl.map((x) => [x.dataKey === "a" ? A.short : B.short, `${num(Number(x.value))} u`])}
                />
              )}
            />
            <Bar dataKey="b" fill="var(--ink-5)" radius={[2, 2, 0, 0]} {...anim(still)} />
            <Bar
              dataKey="a"
              radius={[2, 2, 0, 0]}
              {...anim(still)}
              cursor="pointer"
              onClick={(_, i) => {
                const d = data[i]
                if (!d) return
                const ts = a.tickets.filter((t) => t.weekday === d.w)
                explain({
                  title: `Tickets op ${WEEKDAYS[d.w]}`,
                  value: `${num(d.a)} u`,
                  compare: `tot opgelost, tegenover ${num(a.resolveH)} u over de hele week`,
                  text: `In ${A.label} ${d.n === 1 ? "kwam 1 ticket" : `kwamen ${d.n} tickets`} op ${
                    WEEKDAYS[d.w]
                  } binnen, gemiddeld na ${num(d.a)} u opgelost.${
                    d.w === 0 || d.w === 6 ? " In het weekend heeft niemand dienst, dus die wachten tot maandag." : ""
                  }`,
                  drivers: [...by(ts, (t) => TICKET_TOPIC_LABEL[t.topic])].map(([k, xs]) => ({
                    label: k,
                    value: xs.length
                  })).sort((p, q) => q.value - p.value),
                  unit: "cases",
                  records: [],
                  open: { label: "Tickets openen", to: "/tickets" }
                })
              }}
            >
              {data.map((d) => (
                <Cell
                  key={d.w}
                  fill={d.w === 0 || d.w === 6 ? "var(--arc)" : "color-mix(in oklch, var(--arc) 40%, transparent)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ClientChart>
    </figure>
  )
}

/* ── An answer's chart ──────────────────────────────────────────────────────────────────────── */

export function AnswerBars({ chart }: { chart: AnswerChart }) {
  const still = useReducedMotion()
  const fmt = (
    v: number
  ) => (chart.unit === "$" ? money(v) : chart.unit === "%" ? `${num(v)}%` : chart.unit === "h" ? `${num(v)} u` : num(v))
  const two = chart.rows.some((r) => r.b !== undefined)
  return (
    <div style={{ height: 16 + chart.rows.length * (two ? 30 : 24) }}>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chart.rows}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barGap={2}
            barCategoryGap="24%"
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" {...AXIS} width={132} />
            <Tooltip
              cursor={{ fill: "color-mix(in oklch, var(--ink) 4%, transparent)" }}
              content={(p) => (
                <Tip
                  {...p}
                  rows={(pl) =>
                    pl.map((
                      x
                    ) => [x.dataKey === "a" ? chart.legend[0] : (chart.legend[1] ?? ""), fmt(Number(x.value))])}
                />
              )}
            />
            {two ? <Bar dataKey="b" fill="var(--ink-5)" radius={2} {...anim(still)} /> : null}
            <Bar dataKey="a" fill="var(--arc)" radius={2} {...anim(still)} />
          </BarChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  )
}

/**
 * Recharts measures its box before it draws, so a chart can only be drawn in the browser. The server
 * sends the gridlines it will hang from, and the line is drawn in after hydration (ADR-0028).
 */
function ClientChart({ children }: { children: ReactNode }) {
  return (
    <Stream id={`chart:${useId()}`} after={380} fallback={<ChartBones />} className="h-full w-full">
      {children}
    </Stream>
  )
}

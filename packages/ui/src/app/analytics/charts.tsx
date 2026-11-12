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
import { cn } from "../lib/utils"
import { ChartBones } from "../loading/page-skeletons"
import { Stream } from "../loading/stream"
import { type ReasonView, useAnalyticsSource } from "./analytics-source"

/**
 * The charts a finding carries. Bare — no card, no title, no legend beyond what a dashed line
 * needs — because the sentence above each one is its title. Every mark opens the drawer. What
 * they draw is the source's (`analytics-source.tsx`); until it is read, the gridlines stand in.
 */

export const AXIS = { tick: { fontSize: 12, fill: "var(--ink-3)" }, tickLine: false, axisLine: false } as const
export const anim = (still: boolean | null) => ({
  isAnimationActive: !still,
  animationDuration: 600,
  animationEasing: "ease-out" as const
})
export const num = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })

type Payload = ReadonlyArray<{ value?: unknown; dataKey?: unknown }>

export function Tip({
  active,
  payload,
  label,
  rows
}: {
  active?: boolean
  payload?: Payload
  label?: unknown
  rows: (p: Payload) => Array<[string, string]>
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

export function RevenueChart() {
  const still = useReducedMotion()
  const { A, B, charts, money, kilo, openDay } = useAnalyticsSource()
  const dayName = (d: number) => `${d} ${A.abbr}`
  const data = useMemo(
    () =>
      (charts.daily ?? []).map((p) => ({
        ...p,
        label: String(p.day),
        low: p.band?.[0],
        spread: p.band ? p.band[1] - p.band[0] : undefined
      })),
    [charts.daily]
  )
  if (charts.daily === null) return <Bones height={200} />
  const forecast = data.some((p) => p.forecast !== undefined && p.revenue === null)

  function open(i: number) {
    const p = data[i]
    if (!p || p.revenue === null) return
    openDay(p.day)
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
                tickFormatter={(v) => dayName(Number(v))}
              />
              <YAxis {...AXIS} width={44} tickFormatter={(v) => kilo(Number(v))} />
              <Tooltip
                cursor={{ stroke: "var(--arc)", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={(p) => (
                  <Tip
                    {...p}
                    label={dayName(Number(p.label))}
                    rows={(pl) =>
                      pl
                        .filter((x) =>
                          (x.dataKey === "revenue" || x.dataKey === "revenuePrev" || x.dataKey === "forecast") &&
                          typeof x.value === "number"
                        )
                        .map((x) => [
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
const ltX = (v: number) => ((Math.max(LT_MIN, Math.min(LT_MAX, v)) - LT_MIN) / (LT_MAX - LT_MIN)) * 100

/** Every delivered parcel as a dot, by how early or late it was, one row per supplier. */
export function LeadTimeChart({ lit }: { lit?: string | undefined }) {
  const { charts, openSupplier } = useAnalyticsSource()
  if (charts.leadTimes === null) return <Bones height={120} />
  if (charts.leadTimes.length === 0) return <p className="text-ink-3 text-sm">Nog niets bezorgd in deze periode.</p>
  return (
    <figure className="flex flex-col gap-0.5">
      {charts.leadTimes.map((r) => {
        const on = lit === undefined || lit === r.key
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => openSupplier(r.key)}
            className="group grid cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md py-1.5 text-left sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]"
          >
            <span className={cn("truncate text-sm", on ? "text-ink" : "text-ink-2")}>{r.label}</span>
            <span
              className={cn(
                "relative h-8 transition-opacity group-hover:opacity-100",
                on ? "opacity-100" : "opacity-35"
              )}
            >
              <span aria-hidden className="absolute top-0 bottom-0 w-px bg-ink/30" style={{ left: `${ltX(0)}%` }} />
              {r.dots.map((o) => {
                const jx = (hash(o.id) % 100) / 100
                const jy = (hash(`${o.id}y`) % 100) / 100
                return (
                  <span
                    key={o.id}
                    aria-hidden
                    className={cn(
                      "absolute size-1.5 rounded-full",
                      o.d > 1 ? "bg-signal-red/70" : o.d > 0 ? "bg-signal-amber/70" : "bg-ink/18"
                    )}
                    style={{ left: `calc(${ltX(o.d + (jx - 0.5) * 0.8)}% - 3px)`, top: `${4 + jy * 22}px` }}
                  />
                )
              })}
            </span>
            <span
              className={cn(
                "text-right text-sm tabular-nums",
                r.late > 10 ? "font-medium text-signal-red" : "text-ink-2"
              )}
            >
              {num(r.late)}%
            </span>
          </button>
        )
      })}
      <figcaption className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] gap-3 text-ink-3 text-xs sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
        <span />
        <span className="relative h-4">
          {[-2, 0, 2, 4, 6].map((d) => (
            <span key={d} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${ltX(d)}%` }}>
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
  onPick
}: {
  rows: ReadonlyArray<ReasonView>
  lit?: string | undefined
  onPick: (r: string) => void
}) {
  const still = useReducedMotion()
  const { A, B } = useAnalyticsSource()
  return (
    <figure className="flex flex-col gap-1">
      <div style={{ height: 16 + rows.length * 30 }}>
        <ClientChart>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...rows]}
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
                    fill={lit === undefined || lit === r.key ?
                      "var(--arc)" :
                      "color-mix(in oklch, var(--arc) 35%, transparent)"}
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

export function RefundsChart({ lit }: { lit?: string | undefined }) {
  const { charts, openRefundReason } = useAnalyticsSource()
  if (charts.refunds === null) return <Bones height={136} />
  return <Reasons rows={charts.refunds} lit={lit} onPick={openRefundReason} />
}

export function DisputesChart({ lit }: { lit?: string | undefined }) {
  const { charts, openDisputeReason } = useAnalyticsSource()
  if (charts.disputes === null) return <Bones height={136} />
  return <Reasons rows={charts.disputes} lit={lit} onPick={openDisputeReason} />
}

/* ── Support by weekday ─────────────────────────────────────────────────────────────────────── */

export function SupportChart() {
  const still = useReducedMotion()
  const { A, B, charts, openWeekday } = useAnalyticsSource()
  if (charts.support === null) return <Bones height={180} />
  const data = [...charts.support]
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
                if (d) openWeekday(d.w)
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

/** A chart not read yet: its gridlines, at its height. */
function Bones({ height }: { height: number }) {
  return (
    <div style={{ height }}>
      <ChartBones />
    </div>
  )
}

/**
 * Recharts measures its box before it draws, so a chart can only be drawn in the browser. The server
 * sends the gridlines it will hang from, and the line is drawn in after hydration (ADR-0028).
 */
export function ClientChart({ children }: { children: ReactNode }) {
  return (
    <Stream id={`chart:${useId()}`} after={380} fallback={<ChartBones />} className="h-full w-full">
      {children}
    </Stream>
  )
}

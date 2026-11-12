import { createContext, type ReactNode, useContext } from "react"

/**
 * What Analyse (`/analytics`) reads and does, from whoever hosts it (as `costs-source.tsx` is for Kosten): the design
 * app computes it from the analytics history, the console reads it from `Analytics.*` (M14 step 2). Everything the
 * screen shows arrives written: figures as the strings they read as, money in the host's currency, each finding's
 * sentence, each row's outcome. What the host cannot read yet is said ("Nog niet beschikbaar"), never made up.
 */

export type FigureId = "revenue" | "paid_orders" | "on_time" | "refund_rate" | "disputes" | "resolve_hours"
export type Tone = "good" | "bad" | "neutral"
/** The chart a finding is drawn with. Two findings never share one, so the column never repeats. */
export type ChartKind = "revenue" | "leadtime" | "refunds" | "disputes" | "support"

/** A month the periods can be: "Mei", and while it runs, "tot 26 mei". */
export interface PeriodMonth {
  /** `YYYY-MM`. */
  id: string
  label: string
  running?: string | undefined
}

/** One period as it reads: "1–26 mei" or "april 2026" in running text, "1–26 mei" or "april" short, "mei" by a day. */
export interface PeriodLabels {
  label: string
  short: string
  abbr: string
}

/** One of the six numbers on the plate. Not available: "—" and why, and nothing to open. */
export interface FigureView {
  id: FigureId
  label: string
  value: string
  before: string
  delta: number
  /** "%", " pp" or "". */
  unit: string
  digits?: number | undefined
  goodWhenUp: boolean
  available: boolean
  open?: (() => void) | undefined
}

/** What Insyte would do about a finding, in one line; filing does it, with Undo. */
export interface ProposalView {
  title: string
  why: string
  fileLabel: string
  decision: "filed" | "discarded" | undefined
  file: () => void
  discard: () => void
  undo: () => void
}

export interface FindingView {
  id: string
  metric: string
  tone: Tone
  headline: string
  chart: ChartKind
  /** The row of the chart the finding is about: a supplier, a reason. */
  lit?: string | undefined
  open: () => void
  proposal?: ProposalView | undefined
}

/** One day of the month, aligned on its day; past the last day read, the estimate and its band. */
export interface DayView {
  day: number
  revenue: number | null
  revenuePrev: number | null
  forecast?: number | undefined
  band?: readonly [number, number] | undefined
}

/** A supplier's delivered parcels, each a dot by how many days early (negative) or late it came. */
export interface LeadRowView {
  key: string
  label: string
  dots: ReadonlyArray<{ id: string; d: number }>
  /** The share late, 0–100. */
  late: number
}

export interface ReasonView {
  key: string
  label: string
  a: number
  b: number
}

/** A weekday's hours to resolved: `w` 0 is Sunday. */
export interface WeekdayView {
  w: number
  label: string
  a: number
  b: number
}

/** Each `null` until it is read. */
export interface ChartsView {
  daily: ReadonlyArray<DayView> | null
  leadTimes: ReadonlyArray<LeadRowView> | null
  refunds: ReadonlyArray<ReasonView> | null
  disputes: ReadonlyArray<ReasonView> | null
  support: ReadonlyArray<WeekdayView> | null
}

/** A signed movement, written out so the sign never rests on the bar alone. */
export interface DriverView {
  label: string
  value: number
  shown: string
  detail?: string | undefined
}

export type RecordTone = "red" | "amber" | "muted" | "plain"

/** One order the drawer counts, as it reads. */
export interface RecordView {
  id: string
  number: string
  day: string
  item: string
  country: string
  store: string
  outcome: string
  tone: RecordTone
  total: string
}

/** A number, explained: the figure, Insyte's reading of it (`null` while it reads), what moved it, the orders. */
export interface DrawerView {
  key: string
  title: string
  value: string
  compare?: string | undefined
  text: string | null
  drivers: ReadonlyArray<DriverView>
  /** `null` while the first page is read. */
  records: ReadonlyArray<RecordView> | null
  /** How many orders it counts in all. */
  total: number
  more?: { load: () => void; loading: boolean } | undefined
  open?: { label: string; to: string; search?: Record<string, string> | undefined } | undefined
  /** It could not be read; trying again reads it again. */
  failed?: { retry: () => void } | undefined
}

export interface AnalyticsSource {
  /** Oldest first. */
  months: ReadonlyArray<PeriodMonth>
  a: string
  b: string
  setPeriods: (a: string, b: string) => void
  A: PeriodLabels
  B: PeriodLabels
  /** No orders yet: nothing to compare, and a page of zeros would read as news. */
  empty?:
    | { action?: { label: string; to: string; search?: Record<string, string> | undefined } | undefined }
    | undefined
  /** The six, in order; `null` until read. */
  figures: ReadonlyArray<FigureView> | null
  /** "Berekend uit … bestellingen …", under the sidebar. */
  footnote: string
  /** Heaviest first; `null` until read. */
  findings: ReadonlyArray<FindingView> | null
  charts: ChartsView
  openDay: (day: number) => void
  openSupplier: (key: string) => void
  openRefundReason: (key: string) => void
  openDisputeReason: (key: string) => void
  openWeekday: (w: number) => void
  drawer: DrawerView | null
  closeDrawer: () => void
  /** A whole amount in the host's currency, no decimals. */
  money: (n: number) => string
  /** The axis's "€12k". */
  kilo: (n: number) => string
  ask: {
    suggested: ReadonlyArray<string>
    submit: (question: string) => void
    /** The answers, drawn by the host; absent where it cannot answer yet. */
    answers?: ReactNode
  }
}

const Context = createContext<AnalyticsSource | null>(null)

export const AnalyticsSourceProvider = Context.Provider

export function useAnalyticsSource(): AnalyticsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("Analyse needs an AnalyticsSourceProvider around it.")
  return source
}

import { Schema } from "effect"

/*
 * Analyse (M14 step 2; widgets/02 Part B, api.md §2.13): two calendar months compared over the same days, every figure
 * read from the daily facts and every one explained down to the rows it sums. Facts carry no wording: the console
 * writes the sentences (a template per finding kind). Amounts are minor units in the workspace's currency, each day's
 * brought in at that day's rate (§0.4, the way Kosten reads them); an order whose currency has no rate yet is left
 * out and counted in `unconverted`. Days are the store's (tickets: the workspace's).
 */

/** A calendar month, `YYYY-MM`. */
export const Month = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
export type Month = typeof Month.Type

const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))

/** A month the pickers offer. */
export const Period = Schema.Struct({
  month: Month,
  /** Days in the month. */
  days: Schema.Int,
  /** The month under way: it is read up to today. */
  inProgress: Schema.Boolean,
  /** For the month under way, today's day of the month ("tot 12 nov"); otherwise null. */
  toDay: Schema.NullOr(Schema.Int)
})
export type Period = typeof Period.Type

export class AnalyticsPeriods extends Schema.Class<AnalyticsPeriods>("analytics/Periods")({
  /** From the month of the first order to the current month, oldest first; only the current one without orders. */
  months: Schema.Array(Period),
  current: Month
}) {}

/** The two months compared: A against B. */
export const PairInput = Schema.Struct({ a: Month, b: Month })
export type PairInput = typeof PairInput.Type

/** A month as read: both are cut to the shorter one's elapsed days (§B.0.2), `from`–`to` inclusive. */
export const Span = Schema.Struct({
  month: Month,
  from: Day,
  to: Day,
  days: Schema.Int,
  /** Whether `to` is the month's last day. */
  full: Schema.Boolean,
  inProgress: Schema.Boolean
})
export type Span = typeof Span.Type

export const FIGURE_IDS = ["revenue", "paid_orders", "on_time", "refund_rate", "disputes", "resolve_hours"] as const
export const FigureId = Schema.Literals(FIGURE_IDS)
export type FigureId = typeof FigureId.Type

/** Which rows a figure sums, and by which day: the footnote's "berekend uit …". */
export const Basis = Schema.Struct({
  rows: Schema.Literals(["orders", "deliveries", "tickets", "disputes"]),
  by: Schema.Literals(["placed", "delivered", "created", "opened"]),
  /** How many rows stand behind A and behind B. */
  a: Schema.Int,
  b: Schema.Int
})
export type Basis = typeof Basis.Type

export const Figure = Schema.Struct({
  id: FigureId,
  /** Money in minor units, percentages 0–100 (unrounded), hours to one decimal; null where nothing was there. */
  a: Schema.NullOr(Schema.Finite),
  b: Schema.NullOr(Schema.Finite),
  /** False where the rows are not kept yet (disputes until the chargebacks land). */
  available: Schema.Boolean,
  basis: Basis
})
export type Figure = typeof Figure.Type

export class AnalyticsOverview extends Schema.Class<AnalyticsOverview>("analytics/Overview")({
  currency: Schema.String,
  A: Span,
  B: Span,
  figures: Schema.Array(Figure),
  /** The footnote: every order (drafts aside) and ticket so far, inside the role's stores, and the first order's day. */
  basis: Schema.Struct({ orders: Schema.Int, tickets: Schema.Int, since: Schema.NullOr(Day) }),
  /** Store-days in A or B whose currency had no rate, left out of the money figures. */
  unconverted: Schema.Int
}) {}

/* ── charts ───────────────────────────────────────────────────────────────────────────────────── */

export const DayPoint = Schema.Struct({
  /** Day of the month. */
  day: Schema.Int,
  /** Counted revenue placed that day in A, and on the same day of B; null after A's last day. */
  a: Schema.NullOr(Schema.Int),
  b: Schema.NullOr(Schema.Int),
  /** For a month under way: the estimate for each day left, with its 80% range (the last real day joins it). */
  forecast: Schema.NullOr(Schema.Int),
  band: Schema.NullOr(Schema.Tuple([Schema.Int, Schema.Int]))
})
export type DayPoint = typeof DayPoint.Type

export const LeadTimeRow = Schema.Struct({
  supplierId: Schema.NullOr(Schema.String),
  /** The supplier's name; null for orders without one. */
  name: Schema.NullOr(Schema.String),
  /** Orders delivered in A, and how many of them late. */
  n: Schema.Int,
  late: Schema.Int,
  /** At most 240 of them, each at its days past the promise (0 on time; an order without a promise that Insyte
   * flagged as delayed sits at 1). */
  dots: Schema.Array(Schema.Struct({ orderId: Schema.String, daysLate: Schema.Int }))
})
export type LeadTimeRow = typeof LeadTimeRow.Type

export const ReasonRow = Schema.Struct({
  /** The reason as stored; null for none given. */
  reason: Schema.NullOr(Schema.String),
  a: Schema.Int,
  b: Schema.Int
})
export type ReasonRow = typeof ReasonRow.Type

export const WeekdayRow = Schema.Struct({
  /** 0 is Sunday. */
  weekday: Schema.Int,
  /** Average hours to done of the tickets that came in that weekday, to one decimal. */
  a: Schema.Finite,
  b: Schema.Finite,
  /** Tickets that came in that weekday in A. */
  n: Schema.Int
})
export type WeekdayRow = typeof WeekdayRow.Type

export class AnalyticsCharts extends Schema.Class<AnalyticsCharts>("analytics/Charts")({
  currency: Schema.String,
  A: Span,
  B: Span,
  daily: Schema.Array(DayPoint),
  leadTimes: Schema.Array(LeadTimeRow),
  /** Refunds made in each period, by their reason. */
  refundReasons: Schema.Array(ReasonRow),
  /** Null until the chargebacks are kept. */
  disputeReasons: Schema.NullOr(Schema.Array(ReasonRow)),
  supportByWeekday: Schema.Array(WeekdayRow)
}) {}

/* ── explaining ───────────────────────────────────────────────────────────────────────────────── */

/** What is being taken apart: a figure, a chart's mark, or a finding's own rows. */
export const ExplainKey = Schema.Union([
  /** Betaalde bestellingen: the counted orders in A, by store. */
  Schema.TaggedStruct("paid_orders", {}),
  /** Revenue on one day of the month in A, against B's same day, by store. */
  Schema.TaggedStruct("day", { day: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 })) }),
  /** One supplier's late deliveries in A, by country. */
  Schema.TaggedStruct("supplier_late", { supplierId: Schema.NullOr(Schema.String) }),
  /** Refunds made for one reason in A, against B, by product. */
  Schema.TaggedStruct("refund_reason", { reason: Schema.NullOr(Schema.String) }),
  /** Tickets that came in on one weekday in A, by topic; no order rows. */
  Schema.TaggedStruct("weekday", { weekday: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })) }),
  /** The revenue finding's rows: A's counted orders of one product in one store. */
  Schema.TaggedStruct("product_store", { productId: Schema.NullOr(Schema.String), storeId: Schema.String }),
  /** The delivery finding's rows: A's late deliveries of one supplier to one country. */
  Schema.TaggedStruct("supplier_country", {
    supplierId: Schema.NullOr(Schema.String),
    country: Schema.NullOr(Schema.String)
  }),
  /** The growth finding's rows: A's counted orders from one channel. */
  Schema.TaggedStruct("channel", { channel: Schema.NullOr(Schema.String) })
])
export type ExplainKey = typeof ExplainKey.Type

export const ExplainRef = Schema.Struct({ a: Month, b: Month, key: ExplainKey })
export type ExplainRef = typeof ExplainRef.Type

/** A driver's or a chart mark's key, `a|b`, in its parts; an empty part is a slice without that dimension (null). */
export const splitKey = (key: string): Array<string | null> => key.split("|").map((p) => (p === "" ? null : p))

/** What moved a number: one slice, its value in A and in B. `dim` says how the console names `key`. */
export const Driver = Schema.Struct({
  dim: Schema.Literals([
    "store",
    "product_store",
    "supplier_country",
    "refund_reason",
    "product",
    "country",
    "weekday",
    "topic",
    "channel",
    "volume",
    "size"
  ]),
  key: Schema.String,
  /** A record's own name where it has one (a store, a product and its store, a supplier); else null. */
  name: Schema.NullOr(Schema.String),
  a: Schema.Finite,
  b: Schema.Finite,
  /** How many rows A's value stands for, where the line names them ("3 tickets"); else null. */
  n: Schema.NullOr(Schema.Int)
})
export type Driver = typeof Driver.Type

export class Explanation extends Schema.Class<Explanation>("analytics/Explanation")({
  ref: ExplainRef,
  currency: Schema.String,
  A: Span,
  B: Span,
  /** The explained figure in A and in B (money in minor units, hours to one decimal). */
  a: Schema.Finite,
  b: Schema.Finite,
  /** For a supplier's late deliveries: how many were delivered. For a weekday: A's hours over the whole week. */
  of: Schema.NullOr(Schema.Finite),
  /** The name the key points at (a supplier, a product and its store). */
  name: Schema.NullOr(Schema.String),
  drivers: Schema.Array(Driver),
  /** The rows behind it, paged by `Analytics.records`; 0 where the rows are tickets. */
  recordCount: Schema.Int
}) {}

export const RecordsInput = Schema.Struct({
  explainKey: ExplainRef,
  /** The last page's `next`; none for the first page. */
  cursor: Schema.optional(Schema.String)
})
export type RecordsInput = typeof RecordsInput.Type

/** What became of an order, as the drawer's "Wat er gebeurde" says it. */
export const Outcome = Schema.Literals(["refunded", "cancelled", "unfulfilled", "on_the_way", "late", "on_time"])
export type Outcome = typeof Outcome.Type

export const RecordRow = Schema.Struct({
  orderId: Schema.String,
  number: Schema.String,
  /** Placed, in the store's timezone. */
  placedDay: Day,
  /** The first line's quantity and title. */
  qty: Schema.Int,
  title: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  storeName: Schema.String,
  outcome: Outcome,
  refundReason: Schema.NullOr(Schema.String),
  daysLate: Schema.NullOr(Schema.Int),
  totalMinor: Schema.Int,
  currency: Schema.String
})
export type RecordRow = typeof RecordRow.Type

export class RecordsPage extends Schema.Class<RecordsPage>("analytics/RecordsPage")({
  rows: Schema.Array(RecordRow),
  /** The next page's cursor; null on the last. */
  next: Schema.NullOr(Schema.String)
}) {}

/* ── findings ─────────────────────────────────────────────────────────────────────────────────── */

export const FINDING_KINDS = ["revenue", "delivery", "refunds", "support", "growth"] as const
export const FindingKind = Schema.Literals(FINDING_KINDS)
export type FindingKind = typeof FindingKind.Type

/**
 * One finding as a detector computed it (widgets/02 "Finding traceability", the demo engine's rules): its tone and
 * weight, the numbers its sentence is made of, what moved it, and the rows that make it true (`records`, paged like
 * any explanation; null where they are tickets). The console writes the sentence per `kind`.
 */
export const Finding = Schema.Struct({
  kind: FindingKind,
  tone: Schema.Literals(["good", "bad", "neutral"]),
  weight: Schema.Finite,
  /** Named numbers and names, per kind (see `use-cases/findings.ts`). */
  figures: Schema.Record(Schema.String, Schema.NullOr(Schema.Union([Schema.Finite, Schema.String]))),
  drivers: Schema.Array(Driver),
  /** The chart it is drawn with, and the mark lit on it. */
  chart: Schema.Literals(["revenue", "leadtime", "refunds", "support"]),
  lit: Schema.NullOr(Schema.String),
  records: Schema.NullOr(ExplainKey),
  recordCount: Schema.Int
})
export type Finding = typeof Finding.Type

export class AnalyticsFindings extends Schema.Class<AnalyticsFindings>("analytics/Findings")({
  currency: Schema.String,
  A: Span,
  B: Span,
  /** Heaviest first. */
  findings: Schema.Array(Finding)
}) {}

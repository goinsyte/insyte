import { Schema } from "effect"

/*
 * Start's three other views (M10.3b; widgets/02 Part A, "Mijn werk", "Agenda", "Activiteit"): facts from rows, never
 * words. The console writes every sentence, in Dutch, and decides where a row leads. A source the role cannot read
 * contributes nothing; a source whose milestone has not landed (chargebacks M13, automations M12, payouts M13, the
 * digest M11, agent actions M15) is not read here at all. Times are epoch milliseconds; a day is `YYYY-MM-DD` in the
 * workspace's timezone.
 */

const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))
const Signal = Schema.Literals(["red", "amber", "green", "idle"])
const Priority = Schema.Literals(["low", "medium", "high"])

/* ── Mijn werk ─────────────────────────────────────────────────────────────────────────────────── */

export const WorkKind = Schema.Literals(["todo", "queue", "ticket", "supplier", "invite"])
export type WorkKind = typeof WorkKind.Type

/**
 * One thing that is the member's to do. `id` is the item's own (`ticket:<id>`), the key the member's `my_work`
 * preference snoozes and ticks by; `subjectId` is the record's.
 */
export const WorkRow = Schema.Struct({
  id: Schema.String,
  kind: WorkKind,
  subjectId: Schema.String,
  /** The to-do's text, the queue row's title, the ticket's title, the supplier's name, the invitee's address. */
  title: Schema.String,
  /** The ticket's number, or the supplier's first late order's. */
  number: Schema.NullOr(Schema.String),
  /** The supplier's open orders that are late. */
  count: Schema.NullOr(Schema.Int),
  signal: Schema.NullOr(Signal),
  priority: Schema.NullOr(Priority),
  /** When it is due, with a time of day. */
  dueAt: Schema.NullOr(Schema.Finite),
  /** When it is due, as a day only (a to-do's day). */
  dueDay: Schema.NullOr(Day),
  /** Done today by the member: a to-do ticked, a ticket closed, a queue row set aside. */
  doneAt: Schema.NullOr(Schema.Finite)
})
export type WorkRow = typeof WorkRow.Type

export class HomeWork extends Schema.Class<HomeWork>("home/HomeWork")({
  timezone: Schema.String,
  rows: Schema.Array(WorkRow)
}) {}

/* ── Agenda ────────────────────────────────────────────────────────────────────────────────────── */

export const AgendaSpan = Schema.Literals(["day", "week"])
export type AgendaSpan = typeof AgendaSpan.Type

/** The day, or the seven days from `from`. */
export const AgendaInput = Schema.Struct({ from: Day, span: AgendaSpan })
export type AgendaInput = typeof AgendaInput.Type

export const AgendaKind = Schema.Literals(["queue", "supplier", "ticket", "invite", "todo"])
export type AgendaKind = typeof AgendaKind.Type

export const AgendaRow = Schema.Struct({
  id: Schema.String,
  kind: AgendaKind,
  subjectId: Schema.String,
  /** The queue row's title, the supplier's name, the ticket's title, the invitee's address, the to-do's text. */
  title: Schema.String,
  /** The store, for a queue row; the order numbers, for a hand-off. */
  detail: Schema.NullOr(Schema.String),
  number: Schema.NullOr(Schema.String),
  /** A hand-off's orders, of which `late` are delayed. */
  count: Schema.NullOr(Schema.Int),
  late: Schema.NullOr(Schema.Int),
  signal: Schema.NullOr(Signal),
  at: Schema.Finite,
  /** A to-do's day: it has no time. `at` is then the day's start in the workspace's timezone. */
  allDay: Schema.Boolean,
  /** An invitation whose `at` has passed. */
  past: Schema.Boolean
})
export type AgendaRow = typeof AgendaRow.Type

export class HomeAgenda extends Schema.Class<HomeAgenda>("home/HomeAgenda")({
  from: Day,
  span: AgendaSpan,
  timezone: Schema.String,
  rows: Schema.Array(AgendaRow)
}) {}

/* ── Activiteit ────────────────────────────────────────────────────────────────────────────────── */

/** Where a row came from, as the feed's "Bron" names it (`SOURCES` in the design). */
export const ActivitySource = Schema.Literals([
  "order",
  "ticket",
  "return",
  "supplier",
  "team",
  "integration",
  "insyte"
])
export type ActivitySource = typeof ActivitySource.Type

export const ACTIVITY_LIMIT = 60

export const ActivityInput = Schema.Struct({
  /** An actor's key (`member:mem_…`), from `actors`. */
  who: Schema.optional(Schema.String),
  source: Schema.optional(ActivitySource),
  /** The last row's `cursor` of the page before. */
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)))
})
export type ActivityInput = typeof ActivityInput.Type

export const ActivityRow = Schema.Struct({
  id: Schema.String,
  cursor: Schema.String,
  at: Schema.Finite,
  source: ActivitySource,
  /** `member`, `supplier_contact`, `api_key`, `system`, `insyte`…, or `shop` for an order the store placed. */
  actorKind: Schema.String,
  actorKey: Schema.String,
  /** A member's name as it is now, or the supplier's; a service has none. */
  actorName: Schema.NullOr(Schema.String),
  /** The audited action (`order.forwarded`), or `order.placed`. */
  action: Schema.String,
  subjectType: Schema.String,
  subjectId: Schema.String,
  /** The record as the row names it: its number or title, where it still exists. */
  label: Schema.NullOr(Schema.String),
  /** What changed, as the audit recorded it (ids and values, never secrets); `{}` for an order placed. */
  diff: Schema.Json,
  /** For an order placed: its total, in minor units of `currency`, and its customer. */
  amountMinor: Schema.NullOr(Schema.Int),
  currency: Schema.NullOr(Schema.String),
  customer: Schema.NullOr(Schema.String)
})
export type ActivityRow = typeof ActivityRow.Type

export class HomeActivity extends Schema.Class<HomeActivity>("home/HomeActivity")({
  rows: Schema.Array(ActivityRow),
  /** Rows under the filter, the page's and the rest. */
  total: Schema.Int,
  /** Who did something, under the source filter, most first. */
  actors: Schema.Array(Schema.Struct({ key: Schema.String, name: Schema.NullOr(Schema.String), count: Schema.Int })),
  /** The sources present, under the actor filter. */
  sources: Schema.Array(Schema.Struct({ source: ActivitySource, count: Schema.Int })),
  /** Continues the feed; `null` at its end. */
  next: Schema.NullOr(Schema.String)
}) {}

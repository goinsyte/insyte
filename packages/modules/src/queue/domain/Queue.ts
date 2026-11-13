import { Schema } from "effect"
import { ProposalView } from "../../proposals/domain/Proposals.ts"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The queue on Start (M10.1; widgets/02 widget `queue`, "Je wachtrij"): what needs the operator, one row per condition
 * about one record, ranked by how soon it needs them. Times are epoch milliseconds; money in minor units of `currency`.
 */

export const QueueKind = Schema.Literals([
  "order_delayed",
  "return_review",
  "quality_review",
  "stock_out",
  "store_disconnected",
  "chargeback_deadline",
  "connection_incident"
])
export type QueueKind = typeof QueueKind.Type
export const Signal = Schema.Literals(["red", "amber", "green", "idle"])
export type Signal = typeof Signal.Type
export const QueueState = Schema.Literals(["open", "seen", "resolved"])

export const QueueRow = Schema.Struct({
  id: Schema.String,
  kind: QueueKind,
  subjectType: Schema.String,
  subjectId: Schema.String,
  /** `null` is every store ("Alle winkels"). */
  storeName: Schema.NullOr(Schema.String),
  signal: Signal,
  /** What happened, in Dutch, as the row says it. */
  title: Schema.String,
  valueMinor: Schema.NullOr(Schema.Int),
  currency: Schema.NullOr(Schema.String),
  dueAt: Schema.NullOr(Schema.Finite),
  state: QueueState,
  /** The plate's proposal, where one is drawn (M10.2). */
  proposalId: Schema.NullOr(Schema.String),
  /** The plate itself while it is open: what Insyte drew for the row, and what filing it does (M10.2). */
  proposal: Schema.NullOr(ProposalView),
  decidedAt: Schema.NullOr(Schema.Finite)
})
export type QueueRow = typeof QueueRow.Type

export const QueueCounts = Schema.Struct({
  /** Open, red or amber: the hero's figure. */
  needsYou: Schema.Int,
  /** Open, with a drawn proposal. */
  drawn: Schema.Int,
  /** Open, and decided in the last day. */
  all: Schema.Int
})

export const QueueTab = Schema.Literals(["needs_you", "drawn", "all"])

export const ListInput = Schema.Struct({
  tab: Schema.optional(QueueTab),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)))
})

export class QueueList extends Schema.Class<QueueList>("queue/QueueList")({
  rows: Schema.Array(QueueRow),
  counts: QueueCounts
}) {}

export const IdInput = Schema.Struct({ id: Schema.String })

export class QueueChange extends Schema.Class<QueueChange>("queue/QueueChange")({
  row: QueueRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A row as it was, for `Shared.undo`. */
export const QueueRestore = Schema.Struct({
  id: Schema.String,
  state: QueueState,
  decidedBy: Schema.NullOr(Schema.String),
  decidedAt: Schema.NullOr(Schema.Finite)
})

/** The row is not one this move applies to (resolved, or already as asked). */
export class QueueItemClosed extends Schema.TaggedError<QueueItemClosed>()("QueueItemClosed", { id: Schema.String }) {}

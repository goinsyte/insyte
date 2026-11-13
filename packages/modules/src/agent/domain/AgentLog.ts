import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { ActionId, Level } from "./Autonomy.ts"

/*
 * Wat Insyte deed (M15 step 6; domain.md §9.8): one row per thing an agent ran, asked first or was refused. The log
 * shows what ran: its sentence, the record, the setting it ran under, what started it, what changed, why, and the way
 * back. Inside the window (five minutes) "Ongedaan maken" spends the action's own undo; after it, a person runs the
 * catalogue's compensation as their own command. Times are epoch milliseconds.
 */

/** What an action changed, precisely enough to take it back by hand (`AgentLog.compensate`). */
export const AgentEffect = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("ticket.status"),
    ticketId: Schema.String,
    from: Schema.String,
    to: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("ticket.priority"),
    ticketId: Schema.String,
    from: Schema.String,
    to: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("ticket.assign"),
    ticketId: Schema.String,
    memberId: Schema.String,
    on: Schema.Boolean
  }),
  Schema.Struct({ kind: Schema.Literal("ticket.create"), ticketId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("order.tags"),
    orderId: Schema.String,
    add: Schema.Array(Schema.String),
    remove: Schema.Array(Schema.String)
  }),
  Schema.Struct({ kind: Schema.Literal("order.note"), orderId: Schema.String, before: Schema.String }),
  /** Taken back only inside the window; nothing to run by hand after it. */
  Schema.Struct({ kind: Schema.Literal("token") })
])
export type AgentEffect = typeof AgentEffect.Type

export const LogSource = Schema.Struct({
  kind: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  to: Schema.NullOr(Schema.String)
})

export const LogStatus = Schema.Literals(["done", "undone", "failed"])

export class AgentLogEntry extends Schema.Class<AgentLogEntry>("agent/AgentLogEntry")({
  id: Schema.String,
  at: Schema.Finite,
  action: ActionId,
  sentence: Schema.String,
  /** The record it acted on, with the label the chip shows. */
  subject: Schema.NullOr(Schema.Struct({ type: Schema.String, id: Schema.String, label: Schema.String })),
  level: Level,
  /** Who filed it, where it ran after a proposal. */
  approvedBy: Schema.NullOr(Schema.String),
  /** "Via MCP · Claude", "Nieuwe e-mail". */
  trigger: Schema.String,
  /** `mcp`, `api`, `event:<name>`… */
  triggerKind: Schema.String,
  status: LogStatus,
  /** Who took it back, by name. */
  undoneBy: Schema.NullOr(Schema.String),
  failReason: Schema.NullOr(Schema.String),
  sources: Schema.Array(LogSource),
  reason: Schema.String,
  before: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
  policyVersion: Schema.Int,
  model: Schema.NullOr(Schema.String),
  promptVersion: Schema.NullOr(Schema.String),
  /** Until when "Ongedaan maken" can take it back; `null` where it never could. */
  undoUntil: Schema.NullOr(Schema.Finite),
  /** What a person can still do by hand after the window ("Toewijzing weghalen"), where anything can. */
  compensation: Schema.NullOr(Schema.String),
  /** Whether the row holds something to take back (an undo inside the window, or a compensation after). */
  reversible: Schema.Boolean
}) {}

export class AgentLogCounts extends Schema.Class<AgentLogCounts>("agent/AgentLogCounts")({
  total: Schema.Int,
  undoable: Schema.Int,
  auto: Schema.Int,
  undone: Schema.Int,
  failed: Schema.Int,
  today: Schema.Int,
  todayUndone: Schema.Int,
  todayFailed: Schema.Int
}) {}

export class AgentLogPage extends Schema.Class<AgentLogPage>("agent/AgentLogPage")({
  rows: Schema.Array(AgentLogEntry),
  counts: AgentLogCounts
}) {}

export const ListInput = Schema.Struct({
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500))),
  action: Schema.optional(ActionId),
  subjectType: Schema.optional(Schema.String),
  subjectId: Schema.optional(Schema.String),
  /** Epoch milliseconds: only rows from then on. */
  since: Schema.optional(Schema.Finite)
})
export type ListInput = typeof ListInput.Type

export const IdInput = Schema.Struct({ id: Schema.String })

export class AgentLogChange extends Schema.Class<AgentLogChange>("agent/AgentLogChange")({
  entry: AgentLogEntry,
  /** The person's own way back from what they just did ("Toch laten staan" is `AgentLog.redo`). */
  undo: Schema.NullOr(UndoTicket)
}) {}

/**
 * The row cannot be taken back now: `window` (the five minutes are over; compensate instead), `irreversible` (it held
 * nothing to take back), `state` (it is not done, or already undone), `sent` (what it sent already left), `redo_window`
 * ("Toch laten staan" is only for a moment, by the person who undid it).
 */
export class AgentActionFixed extends Schema.TaggedError<AgentActionFixed>()("AgentActionFixed", {
  id: Schema.String,
  reason: Schema.Literals(["window", "irreversible", "state", "sent", "redo_window"])
}) {}

/** The policy says Nooit (or the action is outside the catalogue): nothing happened. */
export class ActionNotAllowed extends Schema.TaggedError<ActionNotAllowed>()("ActionNotAllowed", {
  action: Schema.String,
  reason: Schema.String
}) {}

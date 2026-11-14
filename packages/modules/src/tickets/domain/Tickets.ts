import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Tickets as the console, `/v1` and MCP read and change them (M11 step 3; domain.md §6.1, §12.3, widgets/04 §A). The
 * vocabularies are the design's (`lib/types/domain.ts`, `lib/ticket-source.ts`). Times are epoch milliseconds. A
 * ticket's number is `#n`; its assignees are member ids, never initials.
 */

export const TicketStatus = Schema.Literals(["intake", "in_progress", "awaiting_reply", "done"])
export type TicketStatus = typeof TicketStatus.Type
export const TicketPriority = Schema.Literals(["low", "medium", "high"])
export const TicketSource = Schema.Literals([
  "gmail",
  "outlook",
  "email",
  "shopify",
  "klarna",
  "chat",
  "insyte",
  "manual",
  "supplier"
])
/** What a ticket is about, classified by keyword from its title and description (the model replaces it in M15). */
export const TicketTopic = Schema.Literals(["where_is_my_order", "returns", "sizing", "payment", "product_question"])
export type TicketTopic = typeof TicketTopic.Type

/**
 * The lists a ticket can be in. `all` is the board: every column, Klaar included, nothing set aside. `open` is the
 * one meaning of open everywhere else: not done and nothing set aside. `snoozed`, `archived`, `spam` and `trash` each
 * hold what is set aside that way; a snooze that has passed is back on the board without anything waking it.
 */
export const TicketView = Schema.Literals([
  "all",
  "open",
  "mine",
  "unassigned",
  "snoozed",
  "done",
  "archived",
  "trash",
  "spam"
])
export type TicketView = typeof TicketView.Type

export const Person = Schema.Struct({ id: Schema.String, name: Schema.String })

/** The record a ticket is about: an order (its number) or a customer (their name). */
export const Related = Schema.Struct({
  type: Schema.Literals(["order", "customer"]),
  id: Schema.String,
  label: Schema.String
})

export class TicketRow extends Schema.Class<TicketRow>("tickets/TicketRow")({
  id: Schema.String,
  /** `#n` without the `#`. */
  number: Schema.Int,
  title: Schema.String,
  description: Schema.String,
  status: TicketStatus,
  priority: TicketPriority,
  source: TicketSource,
  /** The board's order: one ordering over the workspace, a column shows its own in it. */
  position: Schema.Finite,
  labels: Schema.Array(Schema.String),
  assignees: Schema.Array(Person),
  related: Schema.NullOr(Related),
  template: Schema.NullOr(Schema.String),
  topic: Schema.NullOr(TicketTopic),
  dueAt: Schema.NullOr(Schema.Finite),
  /** When it last moved to Klaar. */
  resolvedAt: Schema.NullOr(Schema.Finite),
  snoozedUntil: Schema.NullOr(Schema.Finite),
  archivedAt: Schema.NullOr(Schema.Finite),
  deletedAt: Schema.NullOr(Schema.Finite),
  spamAt: Schema.NullOr(Schema.Finite),
  /** The comments people wrote, for the card. */
  commentCount: Schema.Int,
  storeId: Schema.NullOr(Schema.String),
  createdAt: Schema.Finite,
  updatedAt: Schema.Finite
}) {}

/** One count per view, and the open tickets per source, for the area panel. */
export const TicketCounts = Schema.Struct({
  all: Schema.Int,
  open: Schema.Int,
  mine: Schema.Int,
  unassigned: Schema.Int,
  snoozed: Schema.Int,
  done: Schema.Int,
  archived: Schema.Int,
  trash: Schema.Int,
  spam: Schema.Int,
  bySource: Schema.Record(Schema.String, Schema.Int)
})
export type TicketCounts = typeof TicketCounts.Type

export const ListInput = Schema.Struct({
  /** One view; absent, every ticket the role may see, set aside or not, as the console filters them itself. */
  view: Schema.optional(TicketView),
  source: Schema.optional(TicketSource),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)))
})

export class TicketList extends Schema.Class<TicketList>("tickets/TicketList")({
  rows: Schema.Array(TicketRow),
  counts: TicketCounts
}) {}

export const CommentKind = Schema.Literals(["comment", "activity", "ai_summary", "email_sent"])

export const TicketComment = Schema.Struct({
  id: Schema.String,
  kind: CommentKind,
  /** A teammate, an API key or an agent, by the name the activity shows. */
  author: Schema.Struct({ kind: Schema.String, id: Schema.String, name: Schema.String }),
  body: Schema.String,
  mentions: Schema.Array(Person),
  createdAt: Schema.Finite,
  editedAt: Schema.NullOr(Schema.Finite)
})
export type TicketComment = typeof TicketComment.Type

export class TicketDetail extends Schema.Class<TicketDetail>("tickets/TicketDetail")({
  ticket: TicketRow,
  /** Newest first, as the activity lists them. */
  comments: Schema.Array(TicketComment),
  /** Whether the viewer follows it ("Ticket volgen"). */
  watching: Schema.Boolean
}) {}

export const TicketTemplate = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  title: Schema.String,
  description: Schema.String,
  priority: TicketPriority,
  labels: Schema.Array(Schema.String)
})
export type TicketTemplate = typeof TicketTemplate.Type

/** What "Nieuw ticket" and the label menus offer: the labels, and the templates of the split button. */
export class TicketOptions extends Schema.Class<TicketOptions>("tickets/TicketOptions")({
  labels: Schema.Array(Schema.String),
  templates: Schema.Array(TicketTemplate)
}) {}

/* ── commands ──────────────────────────────────────────────────────────────────────────────────── */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Title = Schema.String.check(Schema.isMaxLength(200))
const Description = Schema.String.check(Schema.isMaxLength(20_000))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))
const Labels = Schema.Array(Label).check(Schema.isMaxLength(20))
const MemberIds = Schema.Array(Schema.String).check(Schema.isMaxLength(20))

export const CreateInput = Schema.Struct({
  /** Required: an empty one, after trimming, is `Invalid { title: "required" }`. */
  title: Title,
  description: Schema.optional(Description),
  status: Schema.optional(TicketStatus),
  priority: Schema.optional(TicketPriority),
  assigneeIds: Schema.optional(MemberIds),
  labels: Schema.optional(Labels),
  dueAt: Schema.optional(Schema.NullOr(Schema.Finite)),
  /** The template it was started from. */
  template: Schema.optional(Schema.String),
  related: Schema.optional(Schema.Struct({ type: Schema.Literals(["order", "customer"]), id: Schema.String })),
  /**
   * What an Insyte plate files the ticket for (`restock:<product>`): while a ticket filed with the same key is still
   * open, that one is answered, with no undo, instead of a second.
   */
  once: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)))
})

/**
 * "Bijbestelling aanvragen": a ticket per product asking its supplier for a restock date, in the product's store, once
 * per product while that ticket is open (`restock:<product>`). The words come from the product's stock and pace.
 */
export const RestockInput = Schema.Struct({
  productIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(200))
})

/** One ticket's fields, or a priority for many at once (the selection bar). */
export const UpdateInput = Schema.Struct({
  ids: Ids,
  title: Schema.optional(Title),
  description: Schema.optional(Description),
  priority: Schema.optional(TicketPriority),
  dueAt: Schema.optional(Schema.NullOr(Schema.Finite)),
  labels: Schema.optional(Labels)
})

export const SetStatusInput = Schema.Struct({ ids: Ids, status: TicketStatus })
export const AssignInput = Schema.Struct({ id: Schema.String, memberId: Schema.String })
export const IdsInput = Schema.Struct({ ids: Ids })
export const IdInput = Schema.Struct({ id: Schema.String })
export const SnoozeInput = Schema.Struct({ ids: Ids, until: Schema.Finite })
/** A column's cards in their new order; they take the places they held between them. */
export const ReorderInput = Schema.Struct({ ids: Ids })

export const CommentInput = Schema.Struct({
  id: Schema.String,
  body: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(5000)),
  /** The teammates the comment names with `@`; each hears of it. */
  mentions: Schema.optional(MemberIds)
})

export class TicketChange extends Schema.Class<TicketChange>("tickets/TicketChange")({
  tickets: Schema.Array(TicketRow),
  /** `null` where nothing changed, and for a reorder, which needs none. */
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The restock tickets: the new ones with one Undo, and how many were asked for before and are still open. */
export class RestockChange extends Schema.Class<RestockChange>("tickets/RestockChange")({
  tickets: Schema.Array(TicketRow),
  undo: Schema.NullOr(UndoTicket),
  already: Schema.Int
}) {}

/** A ticket's fields as they were, for `Shared.undo`; its labels and assignees only where the command changed them. */
const Before = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: TicketStatus,
  priority: TicketPriority,
  topic: Schema.NullOr(TicketTopic),
  dueAt: Schema.NullOr(Schema.Finite),
  resolvedAt: Schema.NullOr(Schema.Finite),
  snoozedUntil: Schema.NullOr(Schema.Finite),
  archivedAt: Schema.NullOr(Schema.Finite),
  deletedAt: Schema.NullOr(Schema.Finite),
  spamAt: Schema.NullOr(Schema.Finite),
  labels: Schema.optional(Schema.Array(Schema.String)),
  assignees: Schema.optional(Schema.Array(Schema.String))
})
export type Before = typeof Before.Type

export const TicketsRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("fields"), tickets: Schema.Array(Before) }),
  Schema.Struct({ kind: Schema.Literal("created"), ids: Schema.Array(Schema.String) })
])
export type TicketsRestore = typeof TicketsRestore.Type

/** A member who is not (or no longer) in the team: an assignee or a mention. */
export class MemberNotActive extends Schema.TaggedError<MemberNotActive>()("MemberNotActive", {
  memberId: Schema.String
}) {}

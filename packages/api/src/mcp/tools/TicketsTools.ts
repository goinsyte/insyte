import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ActionNotAllowedV1, NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import {
  Ticket,
  TicketComment,
  TicketDetailV1,
  TicketPageV1,
  TicketPriorityV1,
  TicketStatusV1,
  TicketViewFilter
} from "../../http/groups/TicketsGroup.ts"
import { asKey, Governed, IdempotencyKey, OrderId, WriteFailure } from "../Shared.ts"

/* Tickets (M11): the board, one ticket, and writing, changing, moving, assigning and commenting. */

const TicketId = Schema.String.annotate({ description: "The ticket's id (tkt_…), as list_tickets gives it." })
const MemberId = Schema.String.annotate({ description: "A teammate's member id (mem_…), as list_members gives it." })

export const ListTickets = Tool.make("list_tickets", {
  description:
    "Tickets in the board's order, with each view's count: by default every one, or one view (all is the board, open is not done and not set aside, unassigned, snoozed, done, archived, spam, trash). Needs support.read.",
  parameters: Schema.Struct({ view: Schema.optional(TicketViewFilter) }),
  success: TicketPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetTicket = Tool.make("get_ticket", {
  description: "One ticket with its comments, newest first. Needs support.read.",
  parameters: Schema.Struct({ ticket_id: TicketId }),
  success: TicketDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const CreateTicket = Tool.make("create_ticket", {
  description:
    "Writes a ticket, at the top of the board, optionally about one order or one customer; its assignees hear of it. Needs support.write.",
  parameters: Schema.Struct({
    title: Schema.String,
    description: Schema.optional(Schema.String),
    status: Schema.optional(TicketStatusV1),
    priority: Schema.optional(TicketPriorityV1),
    assignee_ids: Schema.optional(Schema.Array(MemberId)),
    labels: Schema.optional(Schema.Array(Schema.String)),
    due_at: Schema.optional(Schema.String).annotate({ description: "ISO 8601." }),
    order_id: Schema.optional(OrderId),
    customer_id: Schema.optional(Schema.String),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Ticket),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const UpdateTicket = Tool.make("update_ticket", {
  description:
    "Changes a ticket's title, description, priority, deadline (null clears it) or its whole set of labels. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    title: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    priority: Schema.optional(TicketPriorityV1),
    due_at: Schema.optional(Schema.NullOr(Schema.String)),
    labels: Schema.optional(Schema.Array(Schema.String)),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Ticket),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SetTicketStatus = Tool.make("set_ticket_status", {
  description: "Moves a ticket to intake, in_progress, awaiting_reply or done. Needs support.write.",
  parameters: Schema.Struct({ ticket_id: TicketId, status: TicketStatusV1, idempotency_key: IdempotencyKey }),
  success: Governed(Ticket),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const AssignTicket = Tool.make("assign_ticket", {
  description: "Puts a teammate on a ticket (they hear of it), or takes them off with unassign. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    member_id: MemberId,
    unassign: Schema.optional(Schema.Boolean),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Ticket),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const CommentOnTicket = Tool.make("comment_on_ticket", {
  description:
    "Adds a comment to a ticket's activity, as the key; the teammates in mentions hear of it. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    body: Schema.String,
    mentions: Schema.optional(Schema.Array(MemberId)),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(TicketComment),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const TicketsTools = Toolkit.make(
  ListTickets,
  GetTicket,
  CreateTicket,
  UpdateTicket,
  SetTicketStatus,
  AssignTicket,
  CommentOnTicket
)

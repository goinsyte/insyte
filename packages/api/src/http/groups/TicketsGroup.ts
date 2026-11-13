import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/* Tickets (M11): the board, one ticket with its comments, and writing, changing, moving, assigning and commenting. */

/** A ticket (M11 step 3): the board's work, numbered `#n`, with who has it and what it is about. */
export const Ticket = Schema.Struct({
  id: Schema.String,
  number: Schema.Int.annotate({ description: "The ticket's number, shown as #12." }),
  title: Schema.String,
  description: Schema.String,
  status: Schema.String.annotate({ description: "intake, in_progress, awaiting_reply or done." }),
  priority: Schema.String.annotate({ description: "low, medium or high." }),
  source: Schema.String.annotate({
    description: "Where it came from: manual (written by a person or a key), or gmail, outlook, shopify, … later."
  }),
  labels: Schema.Array(Schema.String),
  assignees: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  related: Schema.NullOr(Schema.Struct({ type: Schema.String, id: Schema.String, label: Schema.String })).annotate({
    description: "The order or customer it is about."
  }),
  topic: Schema.NullOr(Schema.String).annotate({
    description: "where_is_my_order, returns, sizing, payment or product_question, from its words."
  }),
  due_at: Schema.NullOr(Schema.String),
  resolved_at: Schema.NullOr(Schema.String),
  snoozed_until: Schema.NullOr(Schema.String),
  archived_at: Schema.NullOr(Schema.String),
  spam_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
  comment_count: Schema.Int,
  created_at: Schema.String,
  updated_at: Schema.String
}).annotate({ identifier: "Ticket" })

export const TicketComment = Schema.Struct({
  id: Schema.String,
  author: Schema.Struct({ kind: Schema.String, id: Schema.String, name: Schema.String }),
  body: Schema.String,
  mentions: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  created_at: Schema.String
}).annotate({ identifier: "TicketComment" })

export const TicketPageV1 = Schema.Struct({
  data: Schema.Array(Ticket),
  counts: Schema.Struct({
    all: Schema.Int,
    open: Schema.Int,
    unassigned: Schema.Int,
    snoozed: Schema.Int,
    done: Schema.Int,
    archived: Schema.Int,
    spam: Schema.Int,
    trash: Schema.Int
  })
})

export const TicketDetailV1 = Schema.Struct({
  ...Ticket.fields,
  comments: Schema.Array(TicketComment).annotate({ description: "Newest first." })
}).annotate({ identifier: "TicketDetail" })

export const TicketViewFilter = Schema.Literals([
  "all",
  "open",
  "unassigned",
  "snoozed",
  "done",
  "archived",
  "spam",
  "trash"
])
export const TicketStatusV1 = Schema.Literals(["intake", "in_progress", "awaiting_reply", "done"])
export const TicketPriorityV1 = Schema.Literals(["low", "medium", "high"])

export class TicketsGroup extends HttpApiGroup.make("tickets")
  .add(
    HttpApiEndpoint.get("tickets", "/tickets", {
      query: Schema.Struct({ view: Schema.optional(TicketViewFilter) }),
      success: TicketPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Tickets in the board's order, up to 500: by default every one, or one view (all is the board, open is not done and not set aside); with each view's count. Needs `support.read`."
    ),
    HttpApiEndpoint.get("ticket", "/tickets/:id", {
      params: ById,
      success: TicketDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(OpenApi.Description, "One ticket with its comments. Needs `support.read`."),
    HttpApiEndpoint.post("create", "/tickets", {
      headers: Writes,
      payload: Schema.Struct({
        title: Schema.String,
        description: Schema.optional(Schema.String),
        status: Schema.optional(TicketStatusV1),
        priority: Schema.optional(TicketPriorityV1),
        assignee_ids: Schema.optional(Schema.Array(Schema.String)).annotate({
          description: "Member ids, from /members."
        }),
        labels: Schema.optional(Schema.Array(Schema.String)),
        due_at: Schema.optional(Schema.String).annotate({ description: "ISO 8601." }),
        order_id: Schema.optional(Schema.String),
        customer_id: Schema.optional(Schema.String)
      }),
      success: Ticket,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Writes a ticket by hand, at the top of the board; its assignees hear of it. About one order or one customer at most. Needs `support.write`."
    ),
    HttpApiEndpoint.patch("update", "/tickets/:id", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        title: Schema.optional(Schema.String),
        description: Schema.optional(Schema.String),
        priority: Schema.optional(TicketPriorityV1),
        due_at: Schema.optional(Schema.NullOr(Schema.String)).annotate({ description: "ISO 8601; null clears it." }),
        labels: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "The whole set." })
      }),
      success: Ticket,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Changes a ticket's title, description, priority, deadline or labels. Needs `support.write`."
    ),
    HttpApiEndpoint.post("status", "/tickets/:id/status", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ status: TicketStatusV1 }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Moves a ticket to another column; done records when. Needs `support.write`."),
    HttpApiEndpoint.post("assign", "/tickets/:id/assign", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ member_id: Schema.String }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Puts a teammate on the ticket; they hear of it. Needs `support.write`."),
    HttpApiEndpoint.post("unassign", "/tickets/:id/unassign", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ member_id: Schema.String }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Takes a teammate off the ticket. Needs `support.write`."),
    HttpApiEndpoint.post("comment", "/tickets/:id/comments", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        body: Schema.String,
        mentions: Schema.optional(Schema.Array(Schema.String)).annotate({
          description: "Member ids the comment names; each hears of it."
        })
      }),
      success: TicketComment,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Adds a comment to the ticket's activity, as the key. Needs `support.write`.")
  )
  .annotate(OpenApi.Title, "Tickets")
{}

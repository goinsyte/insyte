import { TicketsTools } from "@insyte/api/mcp/tools/TicketsTools"
import { Effect, Layer } from "effect"
import { governed, type Plan, token } from "../mcp/Governance.ts"
import { TicketsV1 } from "./TicketsV1.ts"

const STATUS: Record<string, string> = {
  intake: "Nieuw",
  in_progress: "Bezig",
  awaiting_reply: "Wacht op antwoord",
  done: "Klaar"
}
const PRIORITY: Record<string, string> = { low: "Laag", medium: "Normaal", high: "Hoog" }

export const TicketsMcp = TicketsTools.toLayer(Effect.gen(function*() {
  const read = yield* TicketsV1
  const ticketSubject = (id: string) =>
    Effect.map(read.ticket(id), (t) => ({
      ticket: { ...t, number: `#${t.number}` },
      subject: { type: "ticket", id: t.id, label: `#${t.number}` }
    }))
  return {
    list_tickets: ({ view }) => read.tickets(view),
    get_ticket: ({ ticket_id }) => read.ticket(ticket_id),
    create_ticket: ({ idempotency_key, ...body }) =>
      governed(
        "create_ticket",
        idempotency_key,
        Effect.succeed<Plan<unknown>>({
          action: "CreateTicket",
          subject: body.order_id !== undefined
            ? { type: "order", id: body.order_id, label: body.title }
            : body.customer_id !== undefined
            ? { type: "customer", id: body.customer_id, label: body.title }
            : { type: "ticket", id: `new:${body.title}`, label: body.title },
          sentence: `Ticket aangemaakt: ${body.title}`,
          after: body.title,
          ask: {
            _tag: "CreateTicket",
            title: body.title,
            ...(body.description === undefined ? {} : { description: body.description }),
            ...(body.status === undefined ? {} : { status: body.status }),
            ...(body.priority === undefined ? {} : { priority: body.priority }),
            ...(body.assignee_ids === undefined ? {} : { assigneeIds: body.assignee_ids }),
            ...(body.labels === undefined ? {} : { labels: body.labels }),
            ...(body.order_id === undefined ? {} : { related: { type: "order" as const, id: body.order_id } }),
            ...(body.customer_id === undefined
              ? {}
              : { related: { type: "customer" as const, id: body.customer_id } })
          },
          effect: (value) => ({ kind: "ticket.create", ticketId: (value as { readonly id: string }).id })
        }),
        read.createTicket(body, idempotency_key)
      ),
    update_ticket: ({ ticket_id, idempotency_key, ...body }) =>
      governed(
        "update_ticket",
        idempotency_key,
        Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => {
          const priority = body.priority !== undefined && body.priority !== ticket.priority ? body.priority : null
          return {
            // Its priority is what the catalogue names; the rest of a ticket's fields go with it.
            action: priority !== null || body.labels === undefined ? "SetPriority" : "ApplyLabel",
            subject,
            sentence: priority !== null
              ? `Prioriteit van ${ticket.number} op ${PRIORITY[priority] ?? priority} gezet`
              : `Ticket ${ticket.number} bijgewerkt`,
            before: priority !== null ? PRIORITY[ticket.priority] ?? ticket.priority : null,
            after: priority !== null ? PRIORITY[priority] ?? priority : null,
            ask: {
              _tag: "UpdateTicket",
              ticketId: ticket_id,
              ...(body.title === undefined ? {} : { title: body.title }),
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(body.labels === undefined ? {} : { labels: body.labels })
            },
            effect: () =>
              priority !== null && body.labels === undefined && body.title === undefined &&
                body.description === undefined && body.due_at === undefined
                ? { kind: "ticket.priority", ticketId: ticket_id, from: ticket.priority, to: priority }
                : { kind: "token" }
          }
        }),
        read.updateTicket(ticket_id, body, idempotency_key)
      ),
    set_ticket_status: ({ ticket_id, idempotency_key, status }) =>
      governed(
        "set_ticket_status",
        idempotency_key,
        Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
          action: "SetTicketStatus",
          subject,
          sentence: `Status van ${ticket.number} op ${STATUS[status] ?? status} gezet`,
          before: STATUS[ticket.status] ?? ticket.status,
          after: STATUS[status] ?? status,
          ask: { _tag: "SetTicketStatus", ticketId: ticket_id, status },
          effect: () => ({ kind: "ticket.status", ticketId: ticket_id, from: ticket.status, to: status })
        })),
        read.moveTicket(ticket_id, status, idempotency_key)
      ),
    assign_ticket: ({ ticket_id, idempotency_key, member_id, unassign }) =>
      governed(
        "assign_ticket",
        idempotency_key,
        Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
          action: "AssignTicket",
          subject,
          sentence: unassign === true ? `Toewijzing van ${ticket.number} weggehaald` : `${ticket.number} toegewezen`,
          ask: { _tag: "AssignTicket", ticketId: ticket_id, memberId: member_id, on: unassign !== true },
          effect: () => ({ kind: "ticket.assign", ticketId: ticket_id, memberId: member_id, on: unassign !== true })
        })),
        read.assignTicket(ticket_id, member_id, unassign !== true, idempotency_key)
      ),
    comment_on_ticket: ({ ticket_id, idempotency_key, ...body }) =>
      governed(
        "comment_on_ticket",
        idempotency_key,
        Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
          action: "AddNote",
          subject,
          sentence: `Notitie geplaatst bij ${ticket.number}`,
          after: body.body,
          ask: { _tag: "CommentTicket", ticketId: ticket_id, body: body.body, mentions: body.mentions ?? [] },
          effect: token
        })),
        read.commentTicket(ticket_id, body, idempotency_key)
      )
  }
})).pipe(Layer.provide(TicketsV1.layer))

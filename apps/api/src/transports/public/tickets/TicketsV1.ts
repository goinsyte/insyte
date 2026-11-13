import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import type { TicketRow } from "@insyte/modules/tickets/domain/Tickets"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing, validation, type WriteRefusal, writeV1 } from "../shared/errors.ts"
import { timeOf } from "../shared/time.ts"
import { commentV1, ticketDetailV1, ticketPageV1, ticketV1 } from "./present.ts"

/*
 * Tickets (M11 step 3, M19.2, M19.3): the board, one ticket, and writing, changing, moving, assigning and commenting,
 * each once per `Idempotency-Key`.
 */

/** The tickets refusals in the V1 envelope: someone not in the team is a field that cannot be used. */
const ticketsV1 = (field: string) =>
(
  e: WriteRefusal | { readonly _tag: "MemberNotActive"; readonly memberId: string }
) => e._tag === "MemberNotActive" ? validation({ [field]: "not_active" }) : writeV1(e)

const make = Effect.gen(function*() {
  const tickets = yield* TicketsService
  const ticketOne = (id: string) => Effect.map(tickets.get(id), (d) => ticketV1(d.ticket))
  return {
    tickets: (view?: "all" | "open" | "unassigned" | "snoozed" | "done" | "archived" | "spam" | "trash") =>
      tickets.list(view === undefined ? {} : { view }).pipe(
        Effect.map(ticketPageV1),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    ticket: (id: string) =>
      tickets.get(id).pipe(
        Effect.map(ticketDetailV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    createTicket: (
      body: {
        readonly title: string
        readonly description?: string | undefined
        readonly status?: TicketRow["status"] | undefined
        readonly priority?: TicketRow["priority"] | undefined
        readonly assignee_ids?: ReadonlyArray<string> | undefined
        readonly labels?: ReadonlyArray<string> | undefined
        readonly due_at?: string | undefined
        readonly order_id?: string | undefined
        readonly customer_id?: string | undefined
      },
      key?: string
    ) =>
      Effect.gen(function*() {
        if (body.order_id !== undefined && body.customer_id !== undefined) {
          return yield* validation({ customer_id: "one_record" })
        }
        const dueAt = yield* timeOf("due_at", body.due_at)
        return yield* Idempotency.once(
          key,
          ["ticket.create", body],
          Effect.map(
            tickets.create({
              title: body.title,
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.status === undefined ? {} : { status: body.status }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(body.assignee_ids === undefined ? {} : { assigneeIds: body.assignee_ids }),
              ...(body.labels === undefined ? {} : { labels: body.labels }),
              ...(dueAt === undefined ? {} : { dueAt }),
              ...(body.order_id === undefined ? {} : { related: { type: "order" as const, id: body.order_id } }),
              ...(body.customer_id === undefined
                ? {}
                : { related: { type: "customer" as const, id: body.customer_id } })
            }),
            (change) => ticketV1(change.tickets[0]!)
          )
        ).pipe(Effect.catch(ticketsV1("assignee_ids")))
      }),
    updateTicket: (
      id: string,
      body: {
        readonly title?: string | undefined
        readonly description?: string | undefined
        readonly priority?: TicketRow["priority"] | undefined
        readonly due_at?: string | null | undefined
        readonly labels?: ReadonlyArray<string> | undefined
      },
      key?: string
    ) =>
      Effect.gen(function*() {
        const dueAt = yield* timeOf("due_at", body.due_at)
        return yield* Idempotency.once(
          key,
          ["ticket.update", id, body],
          Effect.flatMap(
            tickets.update({
              ids: [id],
              ...(body.title === undefined ? {} : { title: body.title }),
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(dueAt === undefined ? {} : { dueAt }),
              ...(body.labels === undefined ? {} : { labels: body.labels })
            }),
            () => ticketOne(id)
          )
        ).pipe(Effect.catch(ticketsV1("labels")))
      }),
    moveTicket: (id: string, status: TicketRow["status"], key?: string) =>
      Idempotency.once(
        key,
        ["ticket.status", id, status],
        Effect.flatMap(tickets.setStatus({ ids: [id], status }), () => ticketOne(id))
      ).pipe(Effect.catch(ticketsV1("status"))),
    assignTicket: (id: string, memberId: string, on: boolean, key?: string) =>
      Idempotency.once(
        key,
        ["ticket.assign", id, memberId, on],
        Effect.flatMap(
          on ? tickets.assign({ id, memberId }) : tickets.unassign({ id, memberId }),
          () => ticketOne(id)
        )
      ).pipe(Effect.catch(ticketsV1("member_id"))),
    commentTicket: (
      id: string,
      body: { readonly body: string; readonly mentions?: ReadonlyArray<string> | undefined },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["ticket.comment", id, body],
        Effect.map(
          tickets.comment({
            id,
            body: body.body,
            ...(body.mentions === undefined ? {} : { mentions: body.mentions })
          }),
          commentV1
        )
      ).pipe(Effect.catch(ticketsV1("mentions")))
  }
})

/**
 * Tickets, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class TicketsV1 extends Context.Service<TicketsV1, Effect.Success<typeof make>>()("api-worker/TicketsV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(TicketsService.layer))
}

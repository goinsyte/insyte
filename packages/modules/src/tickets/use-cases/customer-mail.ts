import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  CustomerEmailed,
  type EmailCustomerInput,
  MAILED_LINE,
  MailedRestore,
  NoCustomerAddress,
  statusText,
  TicketMail
} from "../domain/CustomerMail.ts"
import type { TicketsRestore } from "../domain/Tickets.ts"
import { before, lock, restore } from "./commands.ts"
import { rowsOf } from "./tickets.ts"

/*
 * "Klant informeren" (M11; widgets/04 §A), at Klantenservice · Bewerken inside the role's stores. The shopper is the
 * ticket's customer, else its order's, each read inside the member's own stores. The mail goes from the team's mailbox
 * (`TicketMail`, the inbox): in the thread the ticket came from, else in a new thread linked to the ticket, so the
 * answer lands in the inbox beside it. On the same transaction the ticket waits on that answer (`awaiting_reply`) and
 * its activity keeps the line the design writes. The mail waits out the undo window; one undo (`tickets.mailed`) takes
 * the mail, the status and the line back together.
 */

export const MAILED = "tickets.mailed"

export const emailCustomer = Effect.fn("Tickets.emailCustomer")(function*(input: EmailCustomerInput) {
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  const mail = yield* TicketMail
  const relay = yield* Relay
  const db = yield* Db
  const { answer, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      const orders = yield* inScope(sql, "o.store_id")
      const customers = yield* inScope(sql, "c.store_id")
      const [who] = yield* sql<{
        customerEmail: string | null
        customerName: string | null
        orderEmail: string | null
        orderName: string | null
        orderNumber: string | null
        threadId: string | null
      }>`
        select nullif(btrim(c.email), '') as customer_email, nullif(btrim(c.name), '') as customer_name,
               nullif(btrim(o.customer_email), '') as order_email, nullif(btrim(o.customer_name), '') as order_name,
               o.number as order_number,
               (select e.id from email_threads e where e.ticket_id = t.id and e.deleted_at is null and e.spam_at is null
                order by e.last_message_at desc limit 1) as thread_id
        from tickets t
        left join customers c on c.id = t.customer_id and c.deleted_at is null and ${customers}
        left join orders o on o.id = t.order_id and ${orders}
        where t.id = ${l!.id}`
      const to = who?.customerEmail ?? who?.orderEmail ?? null
      if (to === null) return yield* new NoCustomerAddress({ ticketId: l!.id })
      const words = statusText({
        customer: who?.customerName ?? who?.orderName ?? null,
        about: who?.orderNumber ?? null
      })
      const own = input.body?.trim() ?? ""
      const sent = yield* mail.send(sql, {
        ticketId: l!.id,
        threadId: who?.threadId ?? null,
        to: to.toLowerCase(),
        subject: words.subject,
        body: own === "" ? words.body : own
      })
      if (l!.status !== "awaiting_reply") {
        yield* sql`update tickets set status = 'awaiting_reply', resolved_at = null where id = ${l!.id}`
      } else {
        yield* sql`update tickets set updated_at = now() where id = ${l!.id}`
      }
      const commentId = mintId("tcm")
      yield* sql`insert into ticket_comments (id, workspace_id, ticket_id, kind, author_kind, author_id, body, mentions)
                 values (${commentId}, ${principal.workspaceId}, ${l!.id}, 'email_sent', ${principal.kind},
                         ${principal.id}, ${MAILED_LINE}, '{}'::text[])`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "ticket.customer_emailed",
        subjectType: "ticket",
        subjectId: l!.id,
        diff: { thread: sent.threadId, status: [l!.status, "awaiting_reply"] }
      })
      const ticket: TicketsRestore = { kind: "fields", tickets: [before(l!)] }
      const undo = yield* Undo.issue(sql, {
        command: MAILED,
        compensation: { ticket, commentId, inbox: sent.compensation } satisfies MailedRestore,
        outboxIds: [sent.outboxId]
      })
      const [row] = yield* rowsOf(sql, [l!.id])
      return {
        answer: new CustomerEmailed({ ticket: row!, threadId: sent.threadId, to: to.toLowerCase(), undo }),
        outboxId: sent.outboxId
      }
    })
  )
  yield* relay.kick([outboxId], { afterSeconds: UNDO_SECONDS })
  return answer
})

const decodeMailed = Schema.decodeUnknownEffect(MailedRestore)

/** `tickets.mailed`, on the undo's transaction: the mail called off, the ticket as it was, its activity line gone. */
export const restoreMailed = Effect.fn("Tickets.restoreMailed")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown
) {
  yield* Policy.require("support", 2)
  const undo = yield* decodeMailed(compensation).pipe(Effect.orDie)
  yield* (yield* TicketMail).unsend(sql, undo.inbox)
  yield* restore(sql, undo.ticket)
  yield* sql`delete from ticket_comments where id = ${undo.commentId} and kind = 'email_sent'`
})

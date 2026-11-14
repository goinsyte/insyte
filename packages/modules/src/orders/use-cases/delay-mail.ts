import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type MailTry, retryAfter } from "../../shared/domain/MailRetry.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Senders from "../../shared/use-cases/Senders.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import type { OrdersRestore } from "../domain/Commands.ts"
import { DelayMailRefused, type DelayText } from "../domain/DelayMail.ts"

/*
 * The delay mail (M10.2), at `orders` Bewerken inside the role's stores: the shopper of a delayed order told, in the
 * store's name, with the words the plate showed. The mail is put in line on the command's transaction and sent by the
 * relay's mail sink once the undo window has passed (ADR-0023), so Undo calls it off before it leaves. Once per order:
 * a second is refused while one is in line or went. What did not go keeps why, for the plate's "Opnieuw proberen".
 */

const RESTORE = "orders.restore"

/** Puts the delay mail in line; answers its undo, or why it may not go. */
export const notifyDelay = Effect.fn("Orders.notifyDelay")(function*(input: { readonly orderId: string } & DelayText) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const queued = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [order] = yield* sql<{ id: string; delayed: boolean; email: string | null; told: boolean }>`
        select o.id, o.delayed_at is not null and o.status in ('paid', 'at_supplier', 'shipped') as delayed,
               nullif(o.customer_email, '') as email,
               exists (select 1 from order_mails m where m.order_id = o.id and m.kind = 'delay'
                         and m.state in ('scheduled', 'sent')) as told
        from orders o where o.id = ${input.orderId} and ${scope} for update of o`
      if (order === undefined || !order.delayed) {
        return yield* new DelayMailRefused({ orderId: input.orderId, reason: "not_delayed" })
      }
      if (order.email === null) return yield* new DelayMailRefused({ orderId: input.orderId, reason: "no_email" })
      if (order.told) return yield* new DelayMailRefused({ orderId: input.orderId, reason: "already_told" })
      const mailId = mintId("oml")
      yield* sql`insert into order_mails (id, workspace_id, order_id, kind, to_address, subject, paragraphs, created_by)
                 values (${mailId}, app_workspace_id(), ${order.id}, 'delay', ${order.email}, ${input.subject},
                         ${[...input.paragraphs]}::text[], ${principal.id})`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "order.delay_mail_scheduled",
        subjectType: "order",
        subjectId: order.id,
        diff: { mail: mailId }
      })
      const event = yield* Outbox.write(sql, principal.workspaceId, {
        type: "order.delay_mail",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        mailId
      }, { afterSeconds: UNDO_SECONDS })
      const ticket = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { orders: [], mails: [mailId] } satisfies OrdersRestore,
        outboxIds: [event]
      })
      return { undo: ticket, outboxId: event }
    })
  )
  yield* relay.kick([queued.outboxId], { afterSeconds: UNDO_SECONDS })
  return { undo: queued.undo }
})

/** Called off on the undo's transaction: the mails still in line. Answers how many were. */
export const cancelMails = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  Effect.map(
    sql`update order_mails set state = 'cancelled' where id in ${sql.in([...ids])} and state = 'scheduled'
        returning id`,
    (rows) => rows.length
  )

/** Why a delay mail tried again was called off. */
const CLOSED = "de bestelling is intussen geannuleerd of terugbetaald"

export type DelayMailOutcome =
  | { readonly outcome: "sent"; readonly orderId: string }
  | { readonly outcome: "failed"; readonly orderId: string; readonly error: string }
  | { readonly outcome: "retry"; readonly outboxId: string; readonly afterSeconds: number }
  | { readonly outcome: "skipped" }

/**
 * The relay's mail sink, inside the order's workspace as `system`: the mail sent as it was put in line, if it still is.
 * The provider busy or out: it stays in line and is tried again later from the same sender (`MailRetry.ts`). A mail
 * that is refused, or still does not go after its last try, is kept as failed with why; it is not tried again by
 * itself after that (domain.md §12.7).
 */
export const sendDelayMail = Effect.fn("Orders.sendDelayMail")(
  function*(sql: SqlClient.SqlClient, mailId: string, retry: MailTry = {}) {
    const attempt = retry.attempt ?? 1
    const [m] = yield* sql<{
      workspaceId: string
      orderId: string
      address: string
      subject: string
      paragraphs: ReadonlyArray<string>
      number: string
      shop: string
      closed: boolean
    }>`
      select m.workspace_id, m.order_id, m.to_address as address, m.subject, m.paragraphs, o.number,
             coalesce(nullif(s.name, ''), w.name) as shop, o.status in ('cancelled', 'refunded') as closed
      from order_mails m join orders o on o.id = m.order_id join stores s on s.id = o.store_id
      join workspaces w on w.id = m.workspace_id
      where m.id = ${mailId} and m.state = 'scheduled' for update of m`
    if (m === undefined) return { outcome: "skipped" } as DelayMailOutcome
    // A try again, after the order was cancelled or refunded meanwhile: there is no delay left to tell, so it is called
    // off, and the plate hears why.
    if (attempt > 1 && m.closed) {
      yield* sql`update order_mails set state = 'cancelled', error = ${CLOSED} where id = ${mailId}`
      return { outcome: "failed", orderId: m.orderId, error: CLOSED } as DelayMailOutcome
    }
    const items = yield* sql<{ title: string; variantTitle: string | null; qty: number }>`
      select coalesce(p.title, ol.title) as title, ol.variant_title, ol.quantity as qty
      from order_lines ol left join products p on p.id = ol.product_id
      where ol.order_id = ${m.orderId} order by ol.id`
    const tried = yield* Senders.trySendToCustomer(sql, {
      kind: "order.delayed",
      to: m.address,
      sender: m.shop,
      reference: m.orderId,
      orderDelay: {
        shop: m.shop,
        number: m.number,
        subject: m.subject,
        paragraphs: m.paragraphs,
        items: items.map((i) => ({ title: i.title, variant: i.variantTitle, qty: i.qty }))
      }
    }, { from: retry.from })
    // A try again keeps the sender this one used: after the brand's was refused, Insyte's.
    const { error: sent, from } = tried
    const afterSeconds = sent === null ? undefined : retryAfter(sent, attempt)
    if (sent !== null && afterSeconds !== undefined) {
      yield* sql`update order_mails set error = ${sent.reason} where id = ${mailId}`
      const outboxId = yield* Outbox.write(sql, m.workspaceId, {
        type: "order.delay_mail",
        workspaceId: m.workspaceId,
        userId: "system",
        mailId,
        attempt: attempt + 1,
        from
      }, { afterSeconds })
      yield* Effect.logWarning("a delay mail is tried again later", { mailId, attempt, reason: sent.reason })
      return { outcome: "retry", outboxId, afterSeconds } as DelayMailOutcome
    }
    if (sent !== null) {
      yield* sql`update order_mails set state = 'failed', error = ${sent.reason} where id = ${mailId}`
      return { outcome: "failed", orderId: m.orderId, error: sent.reason } as DelayMailOutcome
    }
    yield* sql`update order_mails set state = 'sent', sent_at = now(), error = null where id = ${mailId}`
    yield* Audit.write(sql, m.workspaceId, { kind: "system", id: "insyte" }, {
      action: "order.delay_mailed",
      subjectType: "order",
      subjectId: m.orderId,
      diff: { mail: mailId }
    })
    return { outcome: "sent", orderId: m.orderId } as DelayMailOutcome
  }
)

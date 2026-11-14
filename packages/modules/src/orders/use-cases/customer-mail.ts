import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Senders from "../../shared/use-cases/Senders.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  CustomerMailQueued,
  CustomerMailRefused,
  type EmailCustomerInput,
  MailsRestore,
  type OrderMail,
  paragraphsOf,
  TrackingSent,
  type TrackingSkip,
  trackingText
} from "../domain/CustomerMail.ts"
import { audit, rowsOf } from "./commands.ts"
import { cancelMails } from "./delay-mail.ts"

/*
 * Mail the shopper from anywhere (M7 9.1; api.md §2.4), inside the role's stores. Each mail is a row in `order_mails`
 * with the words it will carry, put in line on the command's transaction with an outbox event that waits out the undo
 * window (ADR-0023): "Ongedaan maken" calls it off before it leaves. The relay's mail sink (`sendCustomerMail`) sends
 * it in the store's name, from the brand's own domain where E-mail en domein has one.
 *
 * - `emailCustomer`: the team's own words to one order's shopper, at Klantenservice · Bewerken (the order seen at
 *   Bestellingen · Bekijken). It is the use case an automation's `send_email` and `/v1` call too; the caller's id makes
 *   asking twice send once.
 * - `sendTrackingUpdate`: "Track & trace-update sturen", bulk at Bestellingen · Bewerken. Each order's newest parcel is
 *   told once per tracking number: a selection sent twice tells no one twice, a new parcel is told again. What is left
 *   out says why (closed, no parcel, no address, told already); one undo for the selection.
 */

const RESTORE = "orders.unsend"

const MAX_SELECTION = 500

interface MailRow {
  readonly id: string
  readonly orderId: string
  readonly kind: OrderMail["kind"]
  readonly state: OrderMail["state"]
  readonly to: string
  readonly subject: string
}

const mailOf = (r: MailRow): OrderMail => ({
  id: r.id,
  orderId: r.orderId,
  kind: r.kind,
  state: r.state,
  to: r.to,
  subject: r.subject
})

/** Puts the mail in line on `sql` with its outbox event; answers the event, for the undo and the kick. */
const queue = Effect.fn("Orders.queueMail")(function*(sql: SqlClient.SqlClient, mail: {
  readonly id: string
  readonly orderId: string
  readonly kind: "tracking" | "message"
  readonly ref: string | null
  readonly to: string
  readonly subject: string
  readonly paragraphs: ReadonlyArray<string>
}) {
  const principal = yield* CurrentPrincipal
  const [made] = yield* sql<{ id: string }>`
    insert into order_mails (id, workspace_id, order_id, kind, ref, to_address, subject, paragraphs, created_by)
    values (${mail.id}, app_workspace_id(), ${mail.orderId}, ${mail.kind}, ${mail.ref}, ${mail.to}, ${mail.subject},
            ${[...mail.paragraphs]}::text[], ${principal.id})
    on conflict do nothing returning id`
  if (made === undefined) return undefined
  yield* audit(
    sql,
    mail.kind === "tracking" ? "order.tracking_mail_scheduled" : "order.customer_mail_scheduled",
    mail.orderId,
    {
      mail: mail.id
    }
  )
  return yield* Outbox.write(sql, principal.workspaceId, {
    type: "order.mail",
    workspaceId: principal.workspaceId,
    userId: principal.userId ?? principal.id,
    mailId: mail.id
  }, { afterSeconds: UNDO_SECONDS })
})

/** The team's words to the shopper of one order, in the store's name, after the undo window. */
export const emailCustomer = Effect.fn("Orders.emailCustomer")(function*(input: EmailCustomerInput) {
  yield* Policy.require("support", 2)
  yield* Policy.require("orders", 1)
  const subject = input.subject.trim()
  const paragraphs = paragraphsOf(input.body)
  if (subject === "" || paragraphs.length === 0) {
    return yield* new Invalid({
      fields: {
        ...(subject === "" ? { subject: "required" } : {}),
        ...(paragraphs.length === 0 ? { body: "required" } : {})
      }
    })
  }
  const relay = yield* Relay
  const db = yield* Db
  const { answer, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [order] = yield* sql<{ id: string; email: string | null }>`
        select o.id, nullif(btrim(o.customer_email), '') as email from orders o
        where o.id = ${input.orderId} and ${scope} for update of o`
      if (order === undefined) return yield* new NotFound({ entity: "order", id: input.orderId })
      if (input.id !== undefined) {
        const [was] = yield* sql<MailRow>`
          select id, order_id, kind, state, to_address as to, subject from order_mails where id = ${input.id}`
        if (was !== undefined) {
          if (was.orderId !== order.id || was.kind !== "message") {
            return yield* new Conflict({ entity: "order_mail", reason: "mail_id_taken" })
          }
          return { answer: new CustomerMailQueued({ mail: mailOf(was), undo: null }), outboxId: null }
        }
      }
      if (order.email === null) return yield* new CustomerMailRefused({ orderId: order.id, reason: "no_email" })
      const id = input.id ?? mintId("oml")
      const held = yield* queue(sql, {
        id,
        orderId: order.id,
        kind: "message",
        ref: null,
        to: order.email,
        subject,
        paragraphs
      })
      // The id is another workspace's (not visible here, but taken).
      if (held === undefined) return yield* new Conflict({ entity: "order_mail", reason: "mail_id_taken" })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { mails: [id] } satisfies MailsRestore,
        outboxIds: [held]
      })
      const mail: OrderMail = { id, orderId: order.id, kind: "message", state: "scheduled", to: order.email, subject }
      return { answer: new CustomerMailQueued({ mail, undo }), outboxId: held }
    })
  )
  if (outboxId !== null) yield* relay.kick([outboxId], { afterSeconds: UNDO_SECONDS })
  return answer
})

interface TrackingCandidate {
  readonly id: string
  readonly number: string
  readonly customer: string
  readonly email: string | null
  readonly status: string
  readonly shop: string
  readonly carrier: string | null
  readonly tracking: string | null
  readonly told: boolean
}

/** "Track & trace-update sturen": each order's newest parcel told to its shopper, once per tracking number. */
export const sendTrackingUpdate = Effect.fn("Orders.sendTrackingUpdate")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("orders", 2)
  if (ids.length === 0 || ids.length > MAX_SELECTION) return yield* new Invalid({ fields: { ids: "size" } })
  const relay = yield* Relay
  const db = yield* Db
  const { answer, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const wanted = [...new Set(ids)]
      const rows = yield* sql<TrackingCandidate>`
        select o.id, o.number, o.customer_name as customer, nullif(btrim(o.customer_email), '') as email, o.status,
               coalesce(nullif(s.name, ''), w.name) as shop, f.carrier, f.tracking_number as tracking,
               f.tracking_number is not null and exists (
                 select 1 from order_mails m where m.order_id = o.id and m.kind = 'tracking'
                   and m.ref = f.tracking_number and m.state in ('scheduled', 'sent')) as told
        from orders o join stores s on s.id = o.store_id join workspaces w on w.id = o.workspace_id
        left join lateral (
          select f.carrier, f.tracking_number from fulfilments f
          where f.order_id = o.id and f.tracking_number is not null
          order by f.shipped_at desc nulls last, f.id desc limit 1) f on true
        where o.id in ${sql.in(wanted)} and ${scope} order by o.id for update of o`
      const found = new Set(rows.map((r) => r.id))
      const missing = wanted.find((id) => !found.has(id))
      if (missing !== undefined) return yield* new NotFound({ entity: "order", id: missing })
      const skipped: Array<{ id: string; reason: typeof TrackingSkip.Type }> = []
      const told: Array<string> = []
      const mails: Array<string> = []
      const held: Array<string> = []
      for (const o of rows) {
        const reason = o.status === "cancelled" || o.status === "refunded"
          ? "closed"
          : o.tracking === null
          ? "no_tracking"
          : o.email === null
          ? "no_email"
          : o.told
          ? "already_told"
          : null
        if (reason !== null) {
          skipped.push({ id: o.id, reason })
          continue
        }
        const id = mintId("oml")
        const text = trackingText({ shop: o.shop, customer: o.customer, number: o.number, carrier: o.carrier })
        const outboxId = yield* queue(sql, {
          id,
          orderId: o.id,
          kind: "tracking",
          ref: o.tracking,
          to: o.email!,
          subject: text.subject,
          paragraphs: text.paragraphs
        })
        if (outboxId === undefined) {
          skipped.push({ id: o.id, reason: "already_told" })
          continue
        }
        told.push(o.id)
        mails.push(id)
        held.push(outboxId)
      }
      const undo = mails.length === 0 ? null : yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { mails } satisfies MailsRestore,
        outboxIds: held
      })
      return {
        answer: new TrackingSent({ orders: told.length === 0 ? [] : yield* rowsOf(sql, told), skipped, undo }),
        outboxIds: held
      }
    })
  )
  if (outboxIds.length > 0) yield* relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return answer
})

const decodeRestore = Schema.decodeUnknownEffect(MailsRestore)

/**
 * `orders.unsend`, on the undo's transaction: the mails still in line called off. One already gone cannot be: the undo
 * is `Conflict{ already_sent }` and nothing is called off.
 */
export const restoreMails = Effect.fn("Orders.restoreMails")(
  function*(sql: SqlClient.SqlClient, compensation: unknown) {
    // Whoever put the mail in line may call it off: the support seat that wrote it, or the orders seat that sent tracking.
    yield* Policy.require("support", 2).pipe(Effect.catchTag("Forbidden", () => Policy.require("orders", 2)))
    const { mails } = yield* decodeRestore(compensation).pipe(Effect.orDie)
    if (mails.length === 0) return
    if ((yield* cancelMails(sql, mails)) < mails.length) {
      return yield* new Conflict({ entity: "order_mail", reason: "already_sent" })
    }
    const principal = yield* CurrentPrincipal
    const rows = yield* sql<{ id: string; orderId: string }>`select id, order_id from order_mails where id in ${
      sql.in([...mails])
    }`
    for (const r of rows) {
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "order.customer_mail_cancelled",
        subjectType: "order",
        subjectId: r.orderId,
        diff: { mail: r.id }
      })
    }
  }
)

/** What the sink did with one mail. */
export type CustomerMailOutcome =
  | { readonly outcome: "sent"; readonly orderId: string }
  | { readonly outcome: "failed"; readonly orderId: string; readonly error: string }
  | { readonly outcome: "skipped" }

/**
 * The relay's mail sink, inside the order's workspace as `system`: the mail sent as it was put in line, if it still is,
 * in the store's name. An answer goes to E-mail en domein's "Antwoorden naar", else to the workspace's default mailbox,
 * so it lands in the inbox. A mail that does not go is kept as failed with why, and audited; it is not tried again by
 * itself.
 */
export const sendCustomerMail = Effect.fn("Orders.sendCustomerMail")(
  function*(sql: SqlClient.SqlClient, mailId: string) {
    const [m] = yield* sql<{
      workspaceId: string
      orderId: string
      kind: "delay" | "tracking" | "message"
      ref: string | null
      address: string
      subject: string
      paragraphs: ReadonlyArray<string>
      number: string
      shop: string
    }>`
    select m.workspace_id, m.order_id, m.kind, m.ref, m.to_address as address, m.subject, m.paragraphs, o.number,
           coalesce(nullif(s.name, ''), w.name) as shop
    from order_mails m join orders o on o.id = m.order_id join stores s on s.id = o.store_id
    join workspaces w on w.id = m.workspace_id
    where m.id = ${mailId} and m.state = 'scheduled' and m.kind in ('tracking', 'message') for update of m`
    if (m === undefined) return { outcome: "skipped" } as CustomerMailOutcome
    const [parcel] = m.ref === null ? [] : yield* sql<{ carrier: string | null; url: string | null }>`
    select carrier, nullif(btrim(tracking_url), '') as url from fulfilments
    where order_id = ${m.orderId} and tracking_number = ${m.ref} order by shipped_at desc nulls last limit 1`
    const [mailbox] = yield* sql<{ address: string }>`
    select address from mailboxes where status = 'connected' order by is_default desc, created_at limit 1`
    const sent = yield* Senders.sendToCustomer(sql, {
      kind: "order.message",
      to: m.address,
      sender: m.shop,
      reference: mailId,
      ...(mailbox === undefined ? {} : { replyTo: mailbox.address.toLowerCase() }),
      orderMessage: {
        shop: m.shop,
        number: m.number,
        subject: m.subject,
        paragraphs: m.paragraphs,
        ...(m.ref === null
          ? {}
          : { tracking: { carrier: parcel?.carrier ?? null, number: m.ref, url: safeUrl(parcel?.url ?? null) } })
      }
    }).pipe(Effect.as(null), Effect.catchTag("MailNotSent", (e) => Effect.succeed(e.reason)))
    const system = { kind: "system", id: "insyte" } as const
    if (sent !== null) {
      yield* sql`update order_mails set state = 'failed', error = ${sent} where id = ${mailId}`
      yield* Audit.write(sql, m.workspaceId, system, {
        action: "order.customer_mail_failed",
        subjectType: "order",
        subjectId: m.orderId,
        diff: { mail: mailId, error: sent }
      })
      return { outcome: "failed", orderId: m.orderId, error: sent } as CustomerMailOutcome
    }
    yield* sql`update order_mails set state = 'sent', sent_at = now() where id = ${mailId}`
    yield* Audit.write(sql, m.workspaceId, system, {
      action: m.kind === "tracking" ? "order.tracking_mailed" : "order.customer_mailed",
      subjectType: "order",
      subjectId: m.orderId,
      diff: { mail: mailId }
    })
    return { outcome: "sent", orderId: m.orderId } as CustomerMailOutcome
  }
)

/** Only a carrier page on https goes in a shopper's mail. */
const safeUrl = (url: string | null) => {
  if (url === null) return null
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { type MailTry, retryAfter } from "../../shared/domain/MailRetry.ts"
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
  refusedFields,
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
 *   out says why (closed, delivered, no parcel, no address, told already); one undo for the selection.
 */

const RESTORE = "orders.unsend"

const MAX_SELECTION = 500

/**
 * How many of a bulk's mails go each second once its undo window has passed: half Resend's default rate (two a second,
 * for the whole account), so the inbox's answers, delay mails and sign-in links sent meanwhile still go.
 */
const PER_SECOND = 1

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
  const refused = refusedFields(input.subject, input.body)
  if (Object.keys(refused).length > 0) return yield* new Invalid({ fields: refused })
  const subject = input.subject.trim()
  const paragraphs = paragraphsOf(input.body)
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
  const principal = yield* CurrentPrincipal
  const { answer, kicks } = yield* db.scoped((sql) =>
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
      const skipped: Array<{ id: string; reason: TrackingSkip }> = []
      const wanting: Array<{
        id: string
        order_id: string
        ref: string
        to_address: string
        subject: string
        paragraphs: ReadonlyArray<string>
      }> = []
      for (const o of rows) {
        const reason = o.status === "cancelled" || o.status === "refunded"
          ? "closed"
          : o.status === "delivered"
          ? "delivered"
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
        const text = trackingText({ shop: o.shop, customer: o.customer, number: o.number, carrier: o.carrier })
        wanting.push({
          id: mintId("oml"),
          order_id: o.id,
          ref: o.tracking!,
          to_address: o.email!,
          subject: text.subject,
          paragraphs: text.paragraphs
        })
      }
      // In a handful of statements, not a few per order: the transaction holds every selected order's lock.
      const made = wanting.length === 0 ? [] : yield* sql<{ id: string; orderId: string }>`
        insert into order_mails (id, workspace_id, order_id, kind, ref, to_address, subject, paragraphs, created_by)
        select r.id, app_workspace_id(), r.order_id, 'tracking', r.ref, r.to_address, r.subject,
               array(select p.t from jsonb_array_elements_text(r.paragraphs) with ordinality as p(t, n) order by p.n),
               ${principal.id}
        from jsonb_to_recordset(${JSON.stringify(wanting)}::jsonb)
          as r(id text, order_id text, ref text, to_address text, subject text, paragraphs jsonb)
        on conflict do nothing returning id, order_id`
      const kept = new Set(made.map((m) => m.orderId))
      for (const w of wanting) if (!kept.has(w.order_id)) skipped.push({ id: w.order_id, reason: "already_told" })
      const mails = wanting.filter((w) => kept.has(w.order_id))
      yield* Audit.writeMany(
        sql,
        principal.workspaceId,
        { kind: principal.kind, id: principal.id },
        mails.map((m) => ({
          action: "order.tracking_mail_scheduled",
          subjectType: "order",
          subjectId: m.order_id,
          diff: { mail: m.id }
        }))
      )
      // Last, so the undo window starts now and not when the transaction did: a long one would otherwise send while
      // the toast still offers Undo. The mails go `PER_SECOND` a second after it, so the provider is not flooded.
      const events = mails.map((m, i) => ({
        id: mintId("obx"),
        payload: { workspaceId: principal.workspaceId, userId: principal.userId ?? principal.id, mailId: m.id },
        after: UNDO_SECONDS + Math.floor(i / PER_SECOND)
      }))
      if (events.length > 0) {
        yield* sql`insert into outbox (id, workspace_id, event, payload, not_before)
                   select r.id, ${principal.workspaceId}, 'order.mail', r.payload,
                          clock_timestamp() + make_interval(secs => r.after)
                   from jsonb_to_recordset(${JSON.stringify(events)}::jsonb) as r(id text, payload jsonb, after int)`
      }
      const undo = mails.length === 0 ? null : yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { mails: mails.map((m) => m.id) } satisfies MailsRestore,
        outboxIds: events.map((e) => e.id)
      })
      const told = mails.map((m) => m.order_id)
      return {
        answer: new TrackingSent({ orders: told.length === 0 ? [] : yield* rowsOf(sql, told), skipped, undo }),
        kicks: events
      }
    })
  )
  // Each mail onto the queue on its own, when it is due: the queue hands them on as spread, not ten at a time.
  yield* relay.kickEach(kicks.map((e) => ({ outboxId: e.id, afterSeconds: e.after })))
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
  | { readonly outcome: "retry"; readonly outboxId: string; readonly afterSeconds: number }
  | { readonly outcome: "skipped" }

/**
 * The relay's mail sink, inside the order's workspace as `system`: the mail sent as it was put in line, if it still is,
 * in the store's name. An answer goes to E-mail en domein's "Antwoorden naar", else to the workspace's default mailbox,
 * so it lands in the inbox. The provider busy or out: the mail stays in line and is tried again later from the same
 * sender (`MailRetry.ts`). A mail that is refused, or still does not go after its last try, is kept as failed with why,
 * and audited; the order says so.
 */
export const sendCustomerMail = Effect.fn("Orders.sendCustomerMail")(
  function*(sql: SqlClient.SqlClient, mailId: string, retry: MailTry = {}) {
    const attempt = retry.attempt ?? 1
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
    const tried = yield* Senders.trySendToCustomer(sql, {
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
    }, { from: retry.from })
    // A try again keeps the sender this one used: after the brand's was refused, Insyte's.
    const { error: sent, from } = tried
    const system = { kind: "system", id: "insyte" } as const
    const afterSeconds = sent === null ? undefined : retryAfter(sent, attempt)
    if (sent !== null && afterSeconds !== undefined) {
      yield* sql`update order_mails set error = ${sent.reason} where id = ${mailId}`
      const outboxId = yield* Outbox.write(sql, m.workspaceId, {
        type: "order.mail",
        workspaceId: m.workspaceId,
        userId: "system",
        mailId,
        attempt: attempt + 1,
        from
      }, { afterSeconds })
      yield* Effect.logWarning("a shopper's mail is tried again later", { mailId, attempt, reason: sent.reason })
      return { outcome: "retry", outboxId, afterSeconds } as CustomerMailOutcome
    }
    if (sent !== null) {
      const error = sent.reason
      yield* sql`update order_mails set state = 'failed', error = ${error} where id = ${mailId}`
      yield* Audit.write(sql, m.workspaceId, system, {
        action: "order.customer_mail_failed",
        subjectType: "order",
        subjectId: m.orderId,
        diff: { mail: mailId, error, attempts: attempt }
      })
      return { outcome: "failed", orderId: m.orderId, error } as CustomerMailOutcome
    }
    yield* sql`update order_mails set state = 'sent', sent_at = now(), error = null where id = ${mailId}`
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

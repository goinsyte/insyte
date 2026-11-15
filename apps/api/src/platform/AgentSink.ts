import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { actOnTrigger, agentPrincipal, type Prepared, standDown } from "@insyte/modules/agent/Agent"
import {
  type AgentTask,
  draftFlags,
  type Given,
  pickOrder,
  QUESTION_CHARS,
  shipStage,
  systemSender,
  type WismoOrder,
  wismoReply
} from "@insyte/modules/agent/domain/Triggers"
import { firstName } from "@insyte/modules/ai/domain/Guards"
import { replyOn, RESTORE as INBOX_RESTORE } from "@insyte/modules/inbox/use-cases/commands"
import { notifyDelay } from "@insyte/modules/orders/use-cases/delay-mail"
import { draftFor } from "@insyte/modules/proposals/use-cases/proposer"
import { ShippingValue } from "@insyte/modules/settings/domain/Settings"
import { SHIP_STATUSES } from "@insyte/modules/shared/domain/CustomerFacing"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { UndoWindow } from "@insyte/modules/shared/domain/Undo"
import * as Undo from "@insyte/modules/shared/use-cases/Undo"
import { Cause, Effect, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { withAi } from "./Ai.ts"
import { aiMode } from "./AiSettings.ts"

/*
 * What the agent does on its own for each trigger the agent sink heard (M15 step 6; ADR-0027), on the events queue
 * after the event's transaction (`transports/jobs/Queue.ts`), loaded there on the first task an isolate sees. Each
 * trigger goes through `actOnTrigger` as the workspace's agent: claimed once, the autonomy rules asked, the slice's own
 * use case run on Zelf doen, and logged.
 *
 * - A mail asking where an order is → `SendReply`. On Zelf doen, with no person in between, the agent sends a fixed
 *   Dutch text from the order's own facts (`wismoReply`): the customer's first name, the order number, its status in
 *   the workspace's Verzending wording, the carrier, the tracking link of the order's own fulfilment, the expected
 *   delivery, the store's sign-off. No word of it is the model's or the shopper's. It goes to the thread's own customer
 *   five minutes later, so the log can still take it back, and is called off then if the thread changed meanwhile
 *   (`Inbox.sendQueued`). Which order is the mail's own number of theirs, or their one open order; unclear, or the
 *   team's (Eerst vragen, the hours, a limit): Insyte AI writes a draft for the inbox's draft card, flagged where it
 *   names money, a figure or a link it was not given, and a person reads it. Once per thread, once a day per address.
 * - An order delayed → the delay mail (`NotifyDelayedOrder`, under `SendReply`: mailing a shopper), in the words the
 *   queue's plate draws; otherwise that plate on Start is the question.
 *
 * Nothing here logs a mail's words or an address. A trigger that fails is the team's, as it was without the agent; one
 * that could not run at all (the database away) is retried by the queue, and acts once.
 */

/** "Een vraag waar de bestelling is", the same for every customer: the log keeps no one's words. */
const QUESTION = "Waar is mijn bestelling?"

/** The thread as the agent must find it to answer it, read before the reply and again on the send's transaction. */
interface Standing {
  readonly lastId: string | null
  readonly storeId: string | null
  readonly sender: string | null
  readonly customerName: string | null
  readonly customerEmail: string | null
  readonly mailbox: string
  readonly aside: boolean
  readonly connected: boolean
  readonly assigned: boolean
  readonly ticketHeld: boolean
  readonly answered: boolean
  readonly automated: boolean
}

/**
 * The thread's standing, read after its lock where `lock`: the lock on a statement of its own, so the read that follows
 * sees what a writer that held the thread meanwhile committed. A `for update` on this same select would wait for that
 * writer, then recheck the thread's row alone, and read its messages as they were before the wait.
 */
const standingOf = (sql: SqlClient.SqlClient, threadId: string, messageId: string, lock: boolean) =>
  Effect.gen(function*() {
    if (lock) yield* sql`select id from email_threads where id = ${threadId} for update`
    const [row] = yield* sql<Standing>`
      select (select m.id from email_messages m where m.thread_id = t.id
              order by m.created_at desc, m.id desc limit 1) as last_id,
             c.store_id, lower(x.from_address) as sender, c.name as customer_name,
             lower(nullif(c.email, '')) as customer_email, lower(b.address) as mailbox,
             t.deleted_at is not null or t.spam_at is not null as aside, b.status = 'connected' as connected,
             t.assignee_id is not null as assigned,
             exists (select 1 from tickets k where k.id = t.ticket_id and k.deleted_at is null
                     and (k.status = 'in_progress'
                          or exists (select 1 from ticket_assignees a where a.ticket_id = k.id))) as ticket_held,
             exists (select 1 from email_messages m where m.thread_id = t.id and m.direction = 'outbound') as answered,
             coalesce(x.automated, true) as automated
      from email_threads t join mailboxes b on b.id = t.mailbox_id
      left join customers c on c.id = t.customer_id and c.deleted_at is null
      left join email_messages x on x.id = ${messageId} and x.thread_id = t.id and x.direction = 'inbound'
      where t.id = ${threadId}`
    return row
  })

/**
 * Whether the thread is still the agent's to answer, for this mail: the newest message (as Insyte received them) is
 * the one it heard, from the customer the thread is bound to (never a third party on copy), sent by a person, and
 * nobody has answered, taken or binned the thread, or holds the ticket it is linked to. Otherwise it is the team's.
 */
const mine = (row: Standing | undefined, messageId: string): row is Standing =>
  row !== undefined && row.lastId === messageId && !row.aside && row.connected && !row.assigned && !row.ticketHeld &&
  !row.answered && !row.automated && row.sender !== null && row.customerEmail !== null &&
  row.sender === row.customerEmail && !systemSender(row.sender)

/** What the reply on Zelf doen is made from, and what a draft for the team is checked against. */
interface Reply {
  /** The fixed text, or `null` where it is not clear which order, or its status is none to send (`unclear`). */
  readonly text: string | null
  /** Its subject, from the order alone ("Je bestelling #1042"): the thread's is the shopper's words. */
  readonly subject: string | null
  /** What a reply may repeat: the store's name and address, the orders' numbers, carriers and tracking. */
  readonly given: Given
}

const dayIn = (tz: string) => (d: Date | null) =>
  d === null ? null : new Intl.DateTimeFormat("nl-NL", { timeZone: tz, dateStyle: "long" }).format(d)

const decodeShipping = Schema.decodeUnknownOption(ShippingValue)

/** Only a carrier page on https goes in a shopper's mail. */
const httpsOnly = (url: string | null) => {
  if (url === null) return null
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/** The customer's orders, the mail's words to find which one, and the store's wording: read, not written. */
const replyFacts = (sql: SqlClient.SqlClient, threadId: string, messageId: string, row: Standing) =>
  Effect.gen(function*() {
    const [w] = yield* sql<{ tz: string | null; brand: string | null; signature: string; wording: unknown }>`
      select ws.timezone as tz, s.name as brand, b.signature,
             (select v.value from workspace_settings v where v.section = 'shipping') as wording
      from email_threads t join mailboxes b on b.id = t.mailbox_id
      join workspaces ws on ws.id = t.workspace_id
      left join customers c on c.id = t.customer_id left join stores s on s.id = c.store_id
      where t.id = ${threadId}`
    const [mail] = yield* sql<{ subject: string; text: string }>`
      select subject, left(body_text, ${QUESTION_CHARS}) as text from email_messages where id = ${messageId}`
    const orders = yield* sql<{
      number: string
      status: string
      payment: string
      fulfilment: string
      parcels: number
      parcel: string | null
      carrier: string | null
      trackingNumber: string | null
      trackingUrl: string | null
      expected: Date | null
      deliveredAt: Date | null
    }>`
      select o.number, o.status, o.payment_status as payment, o.fulfillment_status as fulfilment,
             (select count(*)::int from fulfilments a where a.order_id = o.id) as parcels,
             coalesce(d.status, f.tracking_status) as parcel,
             coalesce(f.carrier, d.carrier) as carrier, f.tracking_number,
             nullif(btrim(f.tracking_url), '') as tracking_url,
             case when d.estimated_delivery > now() then d.estimated_delivery end as expected,
             coalesce(d.delivered_at, f.delivered_at) as delivered_at
      from orders o join email_threads t on t.customer_id = o.customer_id and t.id = ${threadId}
      left join lateral (select id, carrier, tracking_number, tracking_url, tracking_status, delivered_at
                         from fulfilments where order_id = o.id order by shipped_at desc nulls last limit 1) f on true
      left join deliveries d on d.fulfilment_id = f.id
      where not o.is_draft order by o.placed_at desc limit 20`
    const day = dayIn(w?.tz ?? "Europe/Amsterdam")
    const theirs: Array<WismoOrder> = orders.map((o) => ({
      number: o.number,
      status: o.status,
      payment: o.payment,
      fulfilment: o.fulfilment,
      parcels: o.parcels,
      parcel: o.parcel,
      carrier: o.carrier,
      trackingUrl: httpsOnly(o.trackingUrl),
      expectedOn: day(o.expected),
      deliveredOn: day(o.deliveredAt)
    }))
    const brand = w?.brand ?? ""
    const given: Given = {
      text: JSON.stringify({
        brand,
        mailbox: row.mailbox,
        orders: orders.map((o) => [o.number, o.carrier, o.trackingNumber, o.trackingUrl])
      }),
      figures: []
    }
    const order = pickOrder(`${mail?.subject ?? ""}\n${mail?.text ?? ""}`, theirs)
    const stage = order === null ? null : shipStage(order)
    if (order === null || stage === null) return { text: null, subject: null, given } satisfies Reply
    const wording = Option.getOrNull(decodeShipping(w?.wording))?.statuses ?? SHIP_STATUSES
    const label = wording.find((x) => x.id === stage)?.label ?? SHIP_STATUSES.find((x) => x.id === stage)!.label
    const text = wismoReply({
      firstName: firstName(row.customerName),
      brand,
      signed: (w?.signature ?? "").trim() !== "",
      order,
      label
    })
    return { text, subject: `Je bestelling ${order.number}`, given } satisfies Reply
  })

const reply = (task: AgentTask, t: Extract<AgentTask["trigger"], { kind: "thread.received" }>) =>
  Effect.gen(function*() {
    // Where no model is set up (a preview), Insyte answers nothing and the mail is the team's, as before.
    if ((yield* aiMode) === "off") return
    const db = yield* Db
    const row = yield* db.scopedFor((sql) => standingOf(sql, t.threadId, t.messageId, false))
    if (!mine(row, t.messageId)) return
    const agent = yield* agentPrincipal()
    yield* actOnTrigger<Reply, void, unknown, Db | CurrentPrincipal | CurrentWorkspace | Relay>({
      action: "SendReply",
      dedupeKey: `event:${task.eventId}:SendReply:${t.threadId}`,
      storeId: row.storeId,
      subject: { type: "thread", id: t.threadId, label: QUESTION },
      trigger: { kind: "event:thread.received", label: "Nieuwe e-mail" },
      reason: "Een klant vroeg waar de bestelling is; Insyte antwoordde met de status uit de bestelling.",
      sentence: "Klant geantwoord op de vraag waar de bestelling is",
      after: "Antwoord ingepland",
      sources: [
        { kind: "thread", title: "Mail van de klant", detail: "Vraagt waar de bestelling is", to: "/inbox" }
      ],
      prepare: Effect.map(
        db.scopedFor((sql) => replyFacts(sql, t.threadId, t.messageId, row)).pipe(Effect.orDie),
        (value) => ({ _tag: "Ready", value }) satisfies Prepared<Reply> as Prepared<Reply>
      ),
      // The fixed text goes alone. Not clear which order, or its status none to send: the team's. And the text, though
      // it is only the order's facts, passes the same check a person's draft is flagged by (ai.md §6.2).
      check: (r) =>
        r.text === null || r.subject === null
          ? "unclear"
          : draftFlags(`${r.subject}\n${r.text}`, r.given).length > 0
          ? "guard"
          : null,
      // For the person: Insyte AI's draft, flagged where it names money, a figure or a link it was not given.
      ask: (r) =>
        Effect.gen(function*() {
          const draft = yield* withAi((ai) =>
            Effect.flatMap(ai.drafts, (d) => d.reply({ subject: { type: "thread", id: t.threadId } }))
          ).pipe(Effect.result)
          if (draft._tag === "Failure") {
            const e = draft.failure
            // The same draft being written already: by the thread's other trigger, at the same moment (the queue's
            // delivery and a redelivery). The person finds that one, and the row keeps why it is theirs.
            if (e._tag === "ModelUnavailable" && e.reason === "busy") return { _tag: "Drafted", model: null } as const
            return { _tag: "Held", reason: e._tag === "BudgetExceeded" ? "budget" : "unknown" } as const
          }
          const flags = draftFlags(draft.success.text, r.given)
          if (flags.length > 0) {
            yield* (yield* Db).scoped((sql) => sql`update drafts set flags = ${flags} where id = ${draft.success.id}`)
              .pipe(Effect.orDie)
          }
          const d = draft.success
          return { _tag: "Drafted", model: { name: d.model || d.provider, promptVersion: d.promptVersion } } as const
        }),
      model: () => null,
      run: (r, actionId) =>
        Effect.gen(function*() {
          yield* Policy.require("support", 2)
          const hold = yield* UndoWindow
          const body = r.text!
          const sent = yield* (yield* Db).scoped((sql) =>
            Effect.gen(function*() {
              // Again, on the send's own transaction, the thread locked: the team may have answered or taken it, or a
              // newer mail come in, while the agent got here.
              const now = yield* standingOf(sql, t.threadId, t.messageId, true)
              if (!mine(now, t.messageId)) return standDown("taken")
              // At most one mail of the agent's to one address in 24 hours, whatever thread it is in: a helpdesk that
              // opens a new thread for every answer gets one. Locked per address, so two at once count each other.
              // Before the thread is claimed, so a thread held back today can still be answered later.
              const to = now.customerEmail!
              yield* sql`select pg_advisory_xact_lock(hashtext(app_workspace_id() || ':agent-mail:' || ${to}))`
              const [today] = yield* sql<{ n: number }>`
                select count(*)::int as n from email_messages m join agents a on a.id = m.sent_by
                where m.direction = 'outbound'
                  and m.created_at > now() - interval '24 hours'
                  and exists (select 1 from jsonb_array_elements(m."to") r where lower(r ->> 'email') = ${to})`
              if ((today?.n ?? 0) > 0) return standDown("limit")
              // Once per thread, whichever trigger gets here first.
              const first = yield* sql`
                insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
                values (app_workspace_id(), ${`agent:SendReply:thread:${t.threadId}`}, ${actionId})
                on conflict do nothing returning dedupe_key`
              if (first.length === 0) return standDown("taken")
              // To the thread's own customer, under the mail it answers.
              const q = yield* replyOn(sql, {
                threadId: t.threadId,
                body,
                subject: r.subject!,
                to: { name: now.customerName ?? "", email: to },
                answering: t.messageId
              })
              yield* Undo.issue(sql, { command: INBOX_RESTORE, compensation: q.compensation, outboxIds: [q.outboxId] })
              return q.outboxId
            })
          )
          if (typeof sent !== "string") return sent
          yield* (yield* Relay).kick([sent], { afterSeconds: hold })
        })
    }).pipe(Effect.provideService(CurrentPrincipal, agent))
  })

const delayed = (task: AgentTask, t: Extract<AgentTask["trigger"], { kind: "order.delayed" }>) =>
  Effect.gen(function*() {
    const db = yield* Db
    const agent = yield* agentPrincipal()
    for (const orderId of t.orderIds) {
      // The plate's own drawing: none for an order already told, without an address, or no longer delayed.
      const draft = yield* db.scopedFor((sql) => draftFor(sql, "order", orderId, `notify_delay:${orderId}`))
      if (draft === null || draft.action._tag !== "NotifyDelayedOrder") continue
      const mail = draft.action
      yield* actOnTrigger({
        action: "SendReply",
        dedupeKey: `event:${task.eventId}:NotifyDelayedOrder:${orderId}`,
        storeId: draft.storeId,
        subject: { type: "order", id: orderId, label: draft.number },
        trigger: { kind: "event:order.delayed", label: "Vertraagde bestelling" },
        reason: "De bestelling is vertraagd en de klant wist het nog niet; Insyte stuurde de vertragingsmail.",
        sentence: `Klant van ${draft.number} ingelicht over de vertraging`,
        before: "Klant nog niet ingelicht",
        after: "Vertragingsmail ingepland",
        sources: [
          { kind: "order", title: `Bestelling ${draft.number}`, detail: "Vertraagd", to: `/orders/${orderId}` }
        ],
        prepare: Effect.succeed({ _tag: "Ready", value: mail } as const),
        check: () => null,
        model: () => null,
        run: (m) => Effect.asVoid(notifyDelay({ orderId: m.orderId, subject: m.subject, paragraphs: m.paragraphs }))
      }).pipe(Effect.provideService(CurrentPrincipal, agent))
    }
  })

/**
 * The database failed the task: it could not run, and is the queue's to hand over again, at most five times and then
 * to its dead letters (`infra/app.ts`), so a fault that does not pass is seen there rather than acked away.
 */
const unreached = (cause: Cause.Cause<unknown>) => {
  const e = Cause.squash(cause)
  return typeof e === "object" && e !== null && "_tag" in e && e._tag === "SqlError"
}

/**
 * One task off the queue, in its workspace. Whatever happens is logged and not thrown, but for a database that did
 * not answer: that fails, so the queue retries it (a trigger already claimed is "seen" then, and acts once).
 */
export const act = (task: AgentTask) =>
  (task.trigger.kind === "thread.received"
    ? reply(task, task.trigger)
    : delayed(task, task.trigger)).pipe(
      Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId }),
      Effect.catchCauseIf(
        (cause) => !unreached(cause),
        (cause) => Effect.logWarning("the agent did not act on a trigger", { cause })
      )
    )

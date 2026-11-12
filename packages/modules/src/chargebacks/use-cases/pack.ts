import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Documents, FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type AssemblePackInput, CaseClosed, ChargebackChange, type ChargebackRow } from "../domain/Chargebacks.ts"
import {
  type CaseFacts,
  documentHtml,
  type DocumentKind,
  documentsFor,
  fileStem,
  ITEM_KIND,
  type Mail,
  narrativeOf,
  type Shipment
} from "../domain/Pack.ts"
import { reasonLabel } from "../domain/Rules.ts"
import { rowsOf } from "./chargebacks.ts"
import { lock, OPEN } from "./commands.ts"

/*
 * Evidence packs (M13 step 4; widgets/04 §E "Bewijspakket samenstellen"). Asking for one takes Chargebacks · Bewerken
 * and starts a run per case: a pack already being gathered is left to finish. The run is the `EvidencePackWorkflow`,
 * whose steps are below, as `system` in the case's workspace: work out which documents the case's facts can carry, then
 * each document on its own step (read, rendered to a PDF, kept in R2, put in the pack as gathered by Insyte), then the
 * pack ready, with a line on the timeline. A step of a run that is no longer the pack's own changes nothing, so asking
 * again while a slow run is out never mixes two. What Insyte gathered last time leaves the pack when a new run starts;
 * what the team uploaded stays. A pack is a draft: its documents can be removed, so asking has no undo.
 */

/** A run that has not finished in this long is taken to have died, and may be asked for again. */
const STALE_MINUTES = 15

const ms = (d: Date | null) => d?.getTime() ?? null

/* ── asking ───────────────────────────────────────────────────────────────────────────────────── */

export const assemblePack = Effect.fn("Chargebacks.assemblePack")(function*(input: typeof AssemblePackInput.Type) {
  yield* Policy.require("chargebacks", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const closed = locked.find((c) => !OPEN.has(c.status))
      if (closed !== undefined) return yield* new CaseClosed({ id: closed.id, status: closed.status })
      const packs: Array<{ chargebackId: string; runId: string }> = []
      for (const c of locked) {
        const [running] = yield* sql<{ id: string }>`
          select id from evidence_packs
          where chargeback_id = ${c.id} and state = 'assembling'
            and started_at > now() - make_interval(mins => ${STALE_MINUTES})`
        if (running !== undefined) continue
        const runId = mintId("epr")
        yield* sql`
          insert into evidence_packs (id, workspace_id, chargeback_id, state, run_id, requested_by)
          values (${mintId("evp")}, ${principal.workspaceId}, ${c.id}, 'assembling', ${runId}, ${principal.id})
          on conflict (chargeback_id) do update
            set state = 'assembling', run_id = excluded.run_id, requested_by = excluded.requested_by,
                progress_done = 0, progress_total = 0, error = null, started_at = now(), ready_at = null`
        yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
          action: "chargeback.pack_requested",
          subjectType: "chargeback",
          subjectId: c.id,
          diff: { runId }
        })
        packs.push({ chargebackId: c.id, runId })
      }
      const told = packs.length === 0 ? [] : [
        yield* Outbox.write(sql, principal.workspaceId, {
          type: "chargeback.pack_requested",
          workspaceId: principal.workspaceId,
          userId: principal.id,
          packs
        })
      ]
      return {
        change: new ChargebackChange({ chargebacks: yield* rowsOf(sql, locked.map((c) => c.id)), undo: null }),
        outboxIds: told
      }
    })
  )
  if (outboxIds.length > 0) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds))
  return change
})

/* ── the facts ────────────────────────────────────────────────────────────────────────────────── */

interface CaseRow {
  readonly caseNumber: string
  readonly provider: ChargebackRow["provider"]
  readonly reason: ChargebackRow["reason"]
  readonly reasonCode: string
  readonly amountMinor: string
  readonly currency: string
  readonly customerName: string
  readonly customerEmail: string | null
  readonly openedAt: Date
  readonly deadlineAt: Date
  readonly orderId: string | null
  readonly customerId: string | null
  readonly brand: string
  readonly timezone: string
}

interface OrderRow {
  readonly number: string
  readonly placedAt: Date
  readonly paidAt: Date | null
  readonly paymentGateway: string | null
  readonly cardLast4: string | null
  readonly currency: string
  readonly totalMinor: string
  readonly subtotalMinor: string
  readonly shippingMinor: string
  readonly taxMinor: string
  readonly discountsMinor: string
  readonly address: string | null
}

const country = (code: string) => {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/** The parts of an address as it is written on a parcel. */
const addressOf = (text: string | null): ReadonlyArray<string> => {
  if (text === null) return []
  const a = JSON.parse(text) as Record<string, string | null | undefined>
  const part = (k: string) => (typeof a[k] === "string" && a[k]!.trim() !== "" ? a[k]!.trim() : null)
  const code = part("country")
  return [
    part("name"),
    part("line1"),
    part("line2"),
    [part("postcode"), part("city")].filter(Boolean).join(" ") || null,
    code === null ? null : country(code)
  ].filter((p): p is string => p !== null)
}

/** How much of a mail or a description goes into a document: enough to read, never a whole archive. */
const MAX_TEXT = 4000
const cut = (s: string) => (s.length <= MAX_TEXT ? s : `${s.slice(0, MAX_TEXT).trimEnd()} …`)

/** Everything the documents are made from, read fresh in the case's workspace. */
export const factsOf = Effect.fn("Chargebacks.factsOf")(function*(sql: SqlClient.SqlClient, chargebackId: string) {
  const [c] = yield* sql<CaseRow>`
    select c.case_number, c.provider, c.reason, c.reason_code, c.amount_minor, c.currency,
           coalesce(cu.name, nullif(o.customer_name, ''), c.customer_name) as customer_name,
           coalesce(o.customer_email, cu.email) as customer_email, c.opened_at, c.deadline_at, c.order_id,
           coalesce(c.customer_id, o.customer_id) as customer_id, coalesce(s.name, w.name) as brand,
           w.timezone
    from chargebacks c join workspaces w on w.id = c.workspace_id
    left join orders o on o.id = c.order_id
    left join customers cu on cu.id = coalesce(c.customer_id, o.customer_id)
    left join stores s on s.id = coalesce(o.store_id, c.store_id)
    where c.id = ${chargebackId}`
  if (c === undefined) return undefined

  let order: CaseFacts["order"] = null
  let shipments: Array<Shipment> = []
  if (c.orderId !== null) {
    const [o] = yield* sql<OrderRow>`
      select number, placed_at, paid_at, payment_gateway, card_last4, currency, total_minor, subtotal_minor,
             shipping_minor, tax_minor, discounts_minor, shipping_address::text as address
      from orders where id = ${c.orderId}`
    if (o !== undefined) {
      const lines = yield* sql<
        { title: string; variantTitle: string | null; sku: string | null; quantity: number; unitPriceMinor: string }
      >`select title, variant_title, sku, quantity, unit_price_minor from order_lines
        where order_id = ${c.orderId} order by id`
      const refunds = yield* sql<{ amountMinor: string; currency: string; createdAt: Date }>`
        select amount_minor, currency, created_at from refunds
        where order_id = ${c.orderId} and status = 'succeeded' order by created_at`
      order = {
        number: o.number,
        placedAt: o.placedAt.getTime(),
        paidAt: ms(o.paidAt),
        paymentGateway: o.paymentGateway,
        cardLast4: o.cardLast4,
        currency: o.currency.trim(),
        totalMinor: Number(o.totalMinor),
        subtotalMinor: Number(o.subtotalMinor),
        shippingMinor: Number(o.shippingMinor),
        taxMinor: Number(o.taxMinor),
        discountsMinor: Number(o.discountsMinor),
        address: addressOf(o.address),
        lines: lines.map((l) => ({
          title: l.title,
          variant: l.variantTitle,
          sku: l.sku,
          quantity: l.quantity,
          unitPriceMinor: Number(l.unitPriceMinor)
        })),
        refunds: refunds.map((r) => ({
          amountMinor: Number(r.amountMinor),
          currency: r.currency.trim(),
          at: r.createdAt.getTime()
        }))
      }
      // A parcel as Shopify has it, with what the carrier said since (AfterShip, M8.4) where it was tracked.
      const parcels = yield* sql<{
        carrier: string | null
        trackingNumber: string | null
        trackingUrl: string | null
        shippedAt: Date | null
        deliveredAt: Date | null
        status: string | null
        checkpoint: string | null
      }>`
        select coalesce(d.carrier, f.carrier) as carrier, coalesce(d.tracking_number, f.tracking_number)
                 as tracking_number, f.tracking_url, f.shipped_at,
               coalesce(d.delivered_at, f.delivered_at) as delivered_at,
               coalesce(d.status, f.tracking_status) as status, d.checkpoint
        from fulfilments f left join deliveries d on d.fulfilment_id = f.id
        where f.order_id = ${c.orderId} order by f.shipped_at nulls last, f.id`
      shipments = parcels.map((p) => ({ ...p, shippedAt: ms(p.shippedAt), deliveredAt: ms(p.deliveredAt) }))
    }
  }

  // What the customer and the team said: tickets about the order or the customer, and their mail threads.
  const about = sql.or([
    ...(c.orderId === null ? [] : [sql`t.order_id = ${c.orderId}`]),
    ...(c.customerId === null ? [] : [sql`t.customer_id = ${c.customerId}`])
  ])
  const tickets = c.orderId === null && c.customerId === null ? [] : yield* sql<
    { id: string; number: string; title: string; description: string; createdAt: Date }
  >`select t.id, t.number, t.title, t.description, t.created_at from tickets t
    where ${about} and t.deleted_at is null and t.spam_at is null order by t.created_at limit 20`
  const sent = tickets.length === 0 ? [] : yield* sql<{ ticketId: string; body: string; createdAt: Date }>`
    select ticket_id, body, created_at from ticket_comments
    where ticket_id in ${sql.in(tickets.map((t) => t.id))} and kind = 'email_sent' and deleted_at is null
    order by created_at`
  const threadWhere = sql.or([
    ...(tickets.length === 0 ? [] : [sql`t.ticket_id in ${sql.in(tickets.map((t) => t.id))}`]),
    ...(c.customerId === null ? [] : [sql`t.customer_id = ${c.customerId}`]),
    ...(c.customerEmail === null ? [] : [sql`exists (select 1 from jsonb_array_elements(t.participants) p
                                                    where lower(p ->> 'email') = lower(${c.customerEmail}))`])
  ])
  const threads = tickets.length === 0 && c.customerId === null && c.customerEmail === null ? [] : yield* sql<
    { id: string; subject: string }
  >`select t.id, t.subject from email_threads t
    where ${threadWhere} and t.deleted_at is null and t.spam_at is null order by t.last_message_at desc limit 10`
  const mails = threads.length === 0 ? [] : yield* sql<{
    threadId: string
    direction: "inbound" | "outbound"
    fromName: string
    fromAddress: string
    sentAt: Date
    subject: string
    bodyText: string
    sendState: string | null
  }>`select thread_id, direction, from_name, from_address, sent_at, subject, body_text, send_state
     from email_messages where thread_id in ${sql.in(threads.map((t) => t.id))} order by sent_at limit 200`

  // The team's own words about the order or the case, in its channels (a DM stays between its two).
  const refs = [
    ...(c.orderId === null ? [] : [JSON.stringify([{ kind: "order", id: c.orderId }])]),
    JSON.stringify([{ kind: "chargeback", id: chargebackId }])
  ]
  const chat = yield* sql<{ channel: string; author: string | null; createdAt: Date; body: string }>`
    select coalesce(cv.name, '') as channel, u.name as author, m.created_at, m.body
    from messages m join conversations cv on cv.id = m.conversation_id
    left join members mb on m.author_kind = 'member' and mb.id = m.author_id
    left join auth."user" u on u.id = mb.user_id
    where cv.kind = 'channel' and m.deleted_at is null and m.body <> ''
      and (${sql.or(refs.map((r) => sql`m.records @> ${r}::jsonb`))})
    order by m.created_at limit 100`

  const tz = c.timezone
  return {
    caseNumber: c.caseNumber,
    provider: c.provider,
    reason: c.reason,
    reasonLabel: reasonLabel(c.reasonCode, c.reason),
    amountMinor: Number(c.amountMinor),
    currency: c.currency.trim(),
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    openedAt: c.openedAt.getTime(),
    deadlineAt: c.deadlineAt.getTime(),
    brand: c.brand,
    timezone: tz,
    order,
    shipments,
    tickets: tickets.map((t) => ({
      number: String(t.number),
      title: t.title,
      description: cut(t.description),
      at: t.createdAt.getTime(),
      sent: sent.filter((s) => s.ticketId === t.id).map((s) => ({ at: s.createdAt.getTime(), body: cut(s.body) }))
    })),
    threads: threads.map((t) => ({
      subject: t.subject,
      mails: mails
        // A mail still waiting for its undo window, or one that did not go, was never said to the customer.
        .filter((m) => m.threadId === t.id && (m.direction === "inbound" || m.sendState === "sent"))
        .map((m): Mail => ({
          inbound: m.direction === "inbound",
          from: m.fromName === "" ? m.fromAddress : `${m.fromName} <${m.fromAddress}>`,
          at: m.sentAt.getTime(),
          subject: m.subject,
          body: cut(m.bodyText)
        }))
    })).filter((t) => t.mails.length > 0),
    chat: chat.map((m) => ({
      where: m.channel === "" ? "Teamchat" : `#${m.channel}`,
      author: m.author ?? "Insyte",
      at: m.createdAt.getTime(),
      body: cut(m.body)
    }))
  } satisfies CaseFacts
})

/* ── the run's steps ──────────────────────────────────────────────────────────────────────────── */

/** Whether `runId` is still the pack's run and still gathering: a step of any other run leaves everything alone. */
const current = (sql: SqlClient.SqlClient, chargebackId: string, runId: string) =>
  Effect.map(
    sql<{ id: string }>`select id from evidence_packs
                        where chargeback_id = ${chargebackId} and run_id = ${runId} and state = 'assembling'
                        for update`,
    (rows) => rows.length > 0
  )

const refOf = (runId: string, kind: DocumentKind) => `${runId}:${kind}`

/**
 * The first step: which documents this case can have, counted as the pack's total, and what Insyte gathered on an
 * earlier run out of the pack. Answers the documents to gather, none when the run is not the pack's.
 */
export const planPack = Effect.fn("Chargebacks.planPack")(function*(chargebackId: string, runId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (!(yield* current(sql, chargebackId, runId))) return [] as ReadonlyArray<DocumentKind>
      const facts = yield* factsOf(sql, chargebackId)
      if (facts === undefined) return [] as ReadonlyArray<DocumentKind>
      const kinds = documentsFor(facts)
      yield* sql`update evidence_items set removed_at = now()
                 where chargeback_id = ${chargebackId} and source = 'insyte' and removed_at is null
                   and (source_ref is null or source_ref not like ${`${runId}:%`})`
      yield* sql`update evidence_packs set progress_total = ${kinds.length},
                   narrative_text = ${narrativeOf(facts)}
                 where chargeback_id = ${chargebackId}`
      return kinds
    })
  )
})

/**
 * One document: read, rendered (a PDF, or its HTML where the stage has no browser), kept in R2, and put at the end of
 * the pack as Insyte's. Made once per run: a retried step finds it there. A render or a bucket that fails fails the
 * step, for the Workflow to try again.
 */
export const gatherDocument = Effect.fn("Chargebacks.gatherDocument")(function*(
  chargebackId: string,
  runId: string,
  kind: DocumentKind
) {
  const db = yield* Db
  const ref = refOf(runId, kind)
  const plan = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (!(yield* current(sql, chargebackId, runId))) return undefined
      const [made] = yield* sql`select 1 from evidence_items where chargeback_id = ${chargebackId}
                                and source_ref = ${ref}`
      if (made !== undefined) return undefined
      const facts = yield* factsOf(sql, chargebackId)
      if (facts === undefined) return undefined
      const [ws] = yield* sql<{ id: string }>`select app_workspace_id() as id`
      return { workspaceId: ws!.id, html: documentHtml(kind, facts), stem: fileStem(kind, facts) }
    })
  )
  if (plan === undefined) return "skipped" as const
  const file = yield* Effect.flatMap(Effect.service(Documents), (d) => d.render(plan.html))
  const key = `${plan.workspaceId}/evidence/${chargebackId}/${runId}-${kind}.${file.extension}`
  yield* Effect.flatMap(Effect.service(FileStore), (s) => s.put(key, file.bytes, file.mime))
  const name = `${plan.stem}.${file.extension}`
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (!(yield* current(sql, chargebackId, runId))) return "skipped" as const
      const [kept] = yield* sql<{ id: string }>`
        insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, uploaded_by,
                           scan_state)
        values (${mintId("fil")}, ${plan.workspaceId}, ${key}, ${name}, ${file.mime}, ${file.bytes.length}, 'evidence',
                'chargeback', ${chargebackId}, 'system', 'clean')
        on conflict (r2_key) do update set size_bytes = excluded.size_bytes, deleted_at = null
        returning id`
      const [end] = yield* sql<{ p: number }>`
        select coalesce(max(position), -1) as p from evidence_items
        where chargeback_id = ${chargebackId} and removed_at is null`
      yield* sql`
        insert into evidence_items (id, workspace_id, chargeback_id, kind, file_id, source, source_ref, name,
                                    size_bytes, position, added_by)
        values (${mintId("evi")}, ${plan.workspaceId}, ${chargebackId}, ${ITEM_KIND[kind]}, ${kept!.id}, 'insyte',
                ${ref}, ${name}, ${file.bytes.length}, ${Number(end?.p ?? -1) + 1}, 'insyte')`
      yield* sql`update evidence_packs set progress_done = (
                   select count(*) from evidence_items
                   where chargeback_id = ${chargebackId} and source_ref like ${`${runId}:%`})
                 where chargeback_id = ${chargebackId}`
      return "made" as const
    })
  )
})

/** The last step: the pack is ready, and its timeline says what Insyte put in it. */
export const finishPack = Effect.fn("Chargebacks.finishPack")(function*(chargebackId: string, runId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (!(yield* current(sql, chargebackId, runId))) return false
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from evidence_items
        where chargeback_id = ${chargebackId} and source_ref like ${`${runId}:%`}`
      const n = count?.n ?? 0
      yield* sql`update evidence_packs set state = 'ready', ready_at = now(), progress_done = ${n}
                 where chargeback_id = ${chargebackId}`
      yield* sql`insert into chargeback_events (id, workspace_id, chargeback_id, actor_kind, actor_id, kind, data)
                 values (${mintId("cbe")}, app_workspace_id(), ${chargebackId}, 'insyte', null, 'pack_assembled',
                         ${JSON.stringify({ count: n, runId })}::jsonb)`
      return true
    })
  )
})

/** The Workflow gave up: the pack failed, with why, and can be asked for again. */
export const failPack = Effect.fn("Chargebacks.failPack")(function*(
  chargebackId: string,
  runId: string,
  reason: string
) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      if (!(yield* current(sql, chargebackId, runId))) return
      yield* sql`update evidence_packs set state = 'failed', error = ${reason.slice(0, 500)}
                 where chargeback_id = ${chargebackId}`
    })
  )
})

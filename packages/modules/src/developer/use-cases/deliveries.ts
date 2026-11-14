import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { type AreaId, canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { attemptsFor, isWebhookEvent, WEBHOOK_AUTO_DISABLE_AFTER } from "@insyte/domain/Webhooks"
import { Effect, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { type OutboxEvent, Relay } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import type { StoreAccess } from "../../shared/domain/Stores.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { backoffMs, derivedId, hostOf, isPrivateAddress, signature, signatureHeader } from "../domain/Delivery.ts"
import { WebhookRuns, WebhookSender } from "../domain/Ports.ts"
import { WebhookDeliveryDetail, WebhookDeliveryView } from "../domain/Webhook.ts"

/*
 * Deliveries (M19.4, api.md §7). The outbox's webhooks sink turns a committed fact into the public events it is
 * (`sourcesOf`) and makes one delivery per subscribed endpoint, on the relay's transaction, with the body as it will be
 * sent; once that has committed, each delivery's run is started (`WebhookRuns`): an attempt posts the body, signed, and
 * records what came back; a failure waits out the backoff and tries again while the endpoint's policy allows. Five
 * failed attempts in a row switch the endpoint off and tell whoever manages the integrations. A test send and
 * "Opnieuw versturen" are deliveries of one attempt each, made by a person. A delivery that is still open when its run
 * never started or has died is re-armed by the minute sweep (`rearm`), five times at most, then failed as `internal`.
 *
 * The log is fenced like the records it carries: a member sees the deliveries of their stores only (a test has none),
 * and the body and the answer only where their role reads the event's area (orders, customers, products, support).
 */

/** One public event a fact is: its type, and the record it is about. */
interface Source {
  readonly type: string
  readonly kind: "order" | "customer" | "product" | "ticket"
  readonly id: string
}

/** The public events an outbox event is, record by record; most outbox events are none (api.md §7). */
export const sourcesOf = (event: OutboxEvent): ReadonlyArray<Source> => {
  switch (event.type) {
    case "order.cancelled":
    case "order.delayed":
      return event.orderIds.map((id) => ({ type: event.type, kind: "order", id }))
    case "order.updated":
      return event.change === "fulfil"
        ? event.orderIds.map((id) => ({ type: "order.fulfilled", kind: "order", id }))
        : []
    // Shopify's own (M12 step 3): an order new in the store, and one fulfilled there.
    case "order.placed":
      return event.orderIds.map((id) => ({ type: "order.created", kind: "order", id }))
    case "order.fulfilled":
      return event.orderIds.map((id) => ({ type: "order.fulfilled", kind: "order", id }))
    case "customer.created":
    case "customer.updated":
      return event.customerIds.map((id) => ({ type: event.type, kind: "customer", id }))
    case "product.updated":
      return event.productIds.flatMap((id) => [
        { type: "product.updated", kind: "product" as const, id },
        // Archived is its own event, when the status went there (read with the product).
        ...(event.fields.includes("status") ? [{ type: "product.archived", kind: "product" as const, id }] : [])
      ])
    case "ticket.assigned":
      return [{ type: "ticket.assigned", kind: "ticket", id: event.ticketId }]
    default:
      return []
  }
}

/** The outbox events the sink looks at. */
export const isWebhookSource = (event: OutboxEvent): boolean => sourcesOf(event).length > 0

interface RecordData {
  readonly storeId: string | null
  readonly data: string
  readonly archived: boolean
}

/**
 * The records of one kind as the event's `data`, in the v1 shape's snake_case, with the store each belongs to: one
 * query for all of them, by id.
 */
type Row = { id: string; storeId: string | null; data: string; status?: string }

const recordsOf = (sql: SqlClient.SqlClient, kind: Source["kind"], ids: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const list = [...new Set(ids)]
    const rows = kind === "order"
      ? yield* sql<Row>`
          select id, store_id, json_build_object(
                   'id', id, 'number', number, 'store_id', store_id, 'status', status,
                   'payment_status', payment_status, 'fulfillment_status', fulfillment_status,
                   'total', json_build_object('amount_minor', total_minor, 'currency', currency),
                   'customer', json_build_object('id', customer_id, 'name', customer_name, 'email', customer_email),
                   'tags', tags, 'delayed_at', delayed_at)::text as data
          from orders where id = any(${list}::text[])`
      : kind === "customer"
      ? yield* sql<Row>`
          select id, store_id, json_build_object(
                   'id', id, 'store_id', store_id, 'name', name, 'email', email, 'phone', phone,
                   'country', country, 'tags', tags, 'orders_count', orders_count,
                   'lifetime_value', json_build_object('amount_minor', lifetime_value_minor, 'currency', currency))::text
                   as data
          from customers where id = any(${list}::text[])`
      : kind === "product"
      ? yield* sql<Row>`
          select id, store_id, status, json_build_object(
                   'id', id, 'store_id', store_id, 'title', title, 'handle', handle, 'status', status,
                   'vendor', vendor, 'product_type', product_type, 'tags', tags)::text as data
          from products where id = any(${list}::text[])`
      : yield* sql<Row>`
          select t.id, t.store_id, json_build_object(
                   'id', t.id, 'number', t.number, 'title', t.title, 'status', t.status, 'priority', t.priority,
                   'assignees', coalesce((select json_agg(a.member_id order by a.member_id)
                                          from ticket_assignees a where a.ticket_id = t.id), '[]'::json))::text as data
          from tickets t where t.id = any(${list}::text[])`
    return new Map<string, RecordData>(
      rows.map((r) => [r.id, { storeId: r.storeId, data: r.data, archived: r.status === "archived" }])
    )
  })

const inStores = (stores: StoreAccess, storeId: string | null) =>
  stores === "all" || storeId === null || stores.includes(storeId)

/**
 * The record as the event sends it: an `order.delayed` also says why (`delay_reason`: `exception`, `no_movement`,
 * `supplier_late` or `manual`).
 */
const dataOf = (event: OutboxEvent, data: string) =>
  event.type === "order.delayed"
    ? JSON.stringify({ ...(JSON.parse(data) as Record<string, unknown>), delay_reason: event.reason })
    : data

/** The envelope (api.md §7), as text: what is stored is what is signed and sent. */
const envelope = (fields: {
  readonly id: string
  readonly type: string
  readonly apiVersion: string
  readonly createdAt: Date
  readonly workspaceId: string
  readonly storeId: string | null
  readonly data: string
  readonly test?: boolean
}) =>
  `{"id":${JSON.stringify(fields.id)},"type":${JSON.stringify(fields.type)},"api_version":${
    JSON.stringify(fields.apiVersion)
  },"created_at":${JSON.stringify(fields.createdAt.toISOString())},"workspace_id":${
    JSON.stringify(fields.workspaceId)
  },"store_id":${JSON.stringify(fields.storeId)},${fields.test === true ? `"test":true,` : ""}"data":${fields.data}}`

/** Rows per insert: a large fact (a bulk cancel) goes in a few statements, not one per delivery. */
const INSERT_CHUNK = 500

/**
 * The webhooks sink (M19.4): one delivery per public event per endpoint that takes it, on the relay's transaction, the
 * records read and the deliveries written in bulk. Endpoints that are off, switched off by Insyte or removed get nothing
 * (and keep nothing). No run starts here: `startFor` starts them once the transaction has committed.
 */
export const fanOut = Effect.fn("Webhooks.fanOut")(function*(
  sql: SqlClient.SqlClient,
  outboxId: string,
  event: OutboxEvent
) {
  const sources = sourcesOf(event)
  if (sources.length === 0) return []
  const types = [...new Set(sources.map((s) => s.type))]
  const endpoints = yield* sql<
    { id: string; events: ReadonlyArray<string>; apiVersion: string; stores: StoreAccess; retry: number }
  >`
    select id, events, api_version, stores, retry from webhook_endpoints
    where deleted_at is null and active and auto_disabled_at is null and events && ${types}::text[]`
  if (endpoints.length === 0) return []
  const [{ createdAt } = { createdAt: new Date() }] = yield* sql<{ createdAt: Date }>`
    select created_at from outbox where id = ${outboxId}`
  const wanted = sources.filter((source) => endpoints.some((e) => e.events.includes(source.type)))
  const records = new Map<string, RecordData>()
  for (const kind of new Set(wanted.map((s) => s.kind))) {
    const found = yield* recordsOf(sql, kind, wanted.filter((s) => s.kind === kind).map((s) => s.id))
    for (const [id, record] of found) records.set(`${kind}:${id}`, record)
  }
  const planned: Array<{
    id: string
    endpoint_id: string
    event_id: string
    event: string
    store_id: string | null
    body: unknown
    max_attempts: number
  }> = []
  for (const source of wanted) {
    const record = records.get(`${source.kind}:${source.id}`)
    if (record === undefined) continue
    if (source.type === "product.archived" && !record.archived) continue
    const eventId = yield* Effect.promise(() => derivedId("evt", outboxId, source.type, source.id))
    for (const endpoint of endpoints) {
      if (!endpoint.events.includes(source.type) || !inStores(endpoint.stores, record.storeId)) continue
      const body = envelope({
        id: eventId,
        type: source.type,
        apiVersion: endpoint.apiVersion,
        createdAt,
        workspaceId: event.workspaceId,
        storeId: record.storeId,
        data: dataOf(event, record.data)
      })
      planned.push({
        id: yield* Effect.promise(() => derivedId("whd", eventId, endpoint.id)),
        endpoint_id: endpoint.id,
        event_id: eventId,
        event: source.type,
        store_id: record.storeId,
        body: JSON.parse(body) as unknown,
        max_attempts: attemptsFor(endpoint.retry)
      })
    }
  }
  const made: Array<string> = []
  for (let at = 0; at < planned.length; at += INSERT_CHUNK) {
    const rows = yield* sql<{ id: string }>`
      insert into webhook_deliveries (id, workspace_id, endpoint_id, event_id, event, store_id, body, max_attempts)
      select r.id, ${event.workspaceId}, r.endpoint_id, r.event_id, r.event, r.store_id, r.body, r.max_attempts
      from jsonb_to_recordset(${JSON.stringify(planned.slice(at, at + INSERT_CHUNK))}::jsonb)
             as r(id text, endpoint_id text, event_id text, event text, store_id text, body jsonb, max_attempts int)
      on conflict (id) do nothing returning id`
    made.push(...rows.map((r) => r.id))
  }
  return made
})

/** Runs started at once, at most: a bulk fact's deliveries are handed over in waves. */
const START_CONCURRENCY = 10

/**
 * Hands these deliveries to their runs (after commit, never inside the transaction that made them) and marks the ones
 * that started; one that did not stays unmarked for the minute sweep. Never fails: what it could not do, the sweep does.
 */
export const startRuns = Effect.fn("Webhooks.startRuns")(function*(
  workspaceId: string,
  due: ReadonlyArray<{ readonly id: string; readonly runs: number }>
) {
  if (due.length === 0) return 0
  const runs = yield* WebhookRuns
  const db = yield* Db
  const started = yield* Effect.forEach(
    due,
    (d) => Effect.map(runs.start({ workspaceId, deliveryId: d.id, run: d.runs }), (ok) => ok ? d.id : undefined),
    { concurrency: START_CONCURRENCY }
  )
  const ids = started.filter((id): id is string => id !== undefined)
  if (ids.length > 0) {
    yield* db.scopedFor((sql) =>
      sql`update webhook_deliveries set run_started_at = now() where id = any(${ids}::text[]) and run_started_at is null`
    ).pipe(
      Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
      Effect.catchCause((cause) => Effect.logWarning("webhook runs started but not marked", { workspaceId, cause }))
    )
  }
  return ids.length
})

/** After the relay committed an event: the runs of the deliveries it made (or made before and could not start). */
export const startFor = Effect.fn("Webhooks.startFor")(
  function*(outboxId: string, event: OutboxEvent) {
    const sources = sourcesOf(event)
    if (sources.length === 0) return 0
    const eventIds = yield* Effect.promise(() =>
      Promise.all(sources.map((source) => derivedId("evt", outboxId, source.type, source.id)))
    )
    const db = yield* Db
    const due = yield* db.scopedFor((sql) =>
      sql<{ id: string; runs: number }>`
      select id, runs from webhook_deliveries
      where event_id = any(${[...new Set(eventIds)]}::text[]) and not test and redelivery_of is null
        and outcome = 'pending' and run_started_at is null`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: event.workspaceId as WorkspaceId }))
    return yield* startRuns(event.workspaceId, due)
  },
  (effect) =>
    Effect.catchCause(effect, (cause) => Effect.as(Effect.logWarning("webhook runs not started", { cause }), 0))
)

/** Re-arms a delivery at most this often; the next time it is stranded it fails, as `internal`. */
const MAX_RUNS = 5

/** Stranded deliveries per minute sweep. */
const REARM_BATCH = 200

const STRANDED = (sql: SqlClient.SqlClient, at: Date) =>
  sql`outcome in ('pending', 'retrying')
      and ((run_started_at is null and created_at < ${at}::timestamptz - interval '1 minute')
           or coalesce(next_attempt_at, run_started_at) < ${at}::timestamptz - interval '10 minutes')`

/**
 * The minute sweep (M19.4): every open delivery whose run never started, or has gone quiet past the attempt it waits
 * for, gets a run of the next number (the old one, if it wakes, is stale and sends nothing); one re-armed five times is
 * failed as `internal` instead, for a person to send again. `at` is the cron's time.
 */
export const rearm = Effect.fn("Webhooks.rearm")(function*(at: Date) {
  const db = yield* Db
  const stranded = yield* db.unscopedForCron((sql) =>
    sql<{ workspaceId: string; id: string }>`
      select workspace_id, id from webhook_deliveries_stranded(${at}, ${REARM_BATCH})`
  )
  const byWorkspace = new Map<string, Array<string>>()
  for (const row of stranded) byWorkspace.set(row.workspaceId, [...(byWorkspace.get(row.workspaceId) ?? []), row.id])
  let armed = 0
  for (const [workspaceId, ids] of byWorkspace) {
    const due = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const given = yield* sql<{ endpointId: string }>`
          update webhook_deliveries set outcome = 'failed', error = 'internal', next_attempt_at = null
          where id = any(${ids}::text[]) and runs >= ${MAX_RUNS} and ${STRANDED(sql, at)}
          returning endpoint_id`
        const again = yield* sql<{ id: string; runs: number }>`
          update webhook_deliveries set runs = runs + 1, run_started_at = null
          where id = any(${ids}::text[]) and runs < ${MAX_RUNS} and ${STRANDED(sql, at)}
          returning id, runs`
        return { given, again }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
    if (due.given.length > 0) {
      yield* Effect.logWarning("webhook deliveries failed after five runs", { workspaceId, count: due.given.length })
    }
    armed += yield* startRuns(workspaceId, due.again)
  }
  return armed
})

interface Due {
  readonly id: string
  readonly endpointId: string
  readonly workspaceId: string
  readonly event: string
  readonly body: string
  readonly outcome: string
  readonly attempts: number
  readonly maxAttempts: number
  readonly manual: boolean
  readonly url: string
  readonly secretSealed: string
  readonly previousSecretSealed: string | null
  readonly overlap: boolean
  readonly headers: ReadonlyArray<{ readonly key: string; readonly sealed: string }>
  readonly apiVersion: string
  readonly sending: boolean
  readonly removed: boolean
  readonly runs: number
}

/** What a run's attempt answers: when to try again (epoch ms), or `null` when the delivery is settled. */
export interface Attempted {
  readonly missing?: boolean
  /** This run is not the delivery's current one (it was re-armed), or another settled it: nothing was recorded. */
  readonly stale?: boolean
  readonly next: number | null
  readonly endpointId?: string
  readonly status?: number | null
  readonly outcome?: string
}

const SNIPPET = 2048

/**
 * One attempt of run `run` (in the workspace, as `system`): read what to send, post it signed with nothing held open,
 * record what came back. A delivery whose endpoint was removed, or switched off since it was made, is cancelled
 * instead; a test or a redelivery goes to an endpoint the person could send it to. A run that is no longer the
 * delivery's (re-armed meanwhile) sends nothing. A resolver that does not answer fails the attempt as ours
 * (`ResolverUnavailable`, for the step to try again) and counts toward nothing.
 */
export const attempt = Effect.fn("Webhooks.attempt")(function*(deliveryId: string, run = 0) {
  const db = yield* Db
  const sealer = yield* Sealer
  const sender = yield* WebhookSender
  const [due] = yield* db.scopedFor((sql) =>
    sql<Due>`
      select d.id, d.endpoint_id, d.workspace_id, d.event, d.body::text as body, d.outcome, d.attempts,
             d.max_attempts, (d.test or d.redelivery_of is not null) as manual, e.url, e.secret_sealed,
             e.previous_secret_sealed, coalesce(e.previous_valid_until > now(), false) as overlap, e.headers,
             e.api_version, (e.active and e.auto_disabled_at is null) as sending, e.deleted_at is not null as removed,
             d.runs
      from webhook_deliveries d join webhook_endpoints e on e.id = d.endpoint_id
      where d.id = ${deliveryId}`
  )
  if (due === undefined) return { missing: true, next: null } as Attempted
  if (due.runs !== run) return { stale: true, next: null, endpointId: due.endpointId } as Attempted
  if (due.outcome === "delivered" || due.outcome === "failed" || due.outcome === "cancelled") {
    return { next: null, endpointId: due.endpointId, outcome: due.outcome } as Attempted
  }
  if (due.removed || (!due.manual && !due.sending)) {
    yield* db.scopedFor((sql) =>
      sql`update webhook_deliveries set outcome = 'cancelled', next_attempt_at = null
          where id = ${deliveryId} and runs = ${run} and outcome in ('pending', 'retrying')`
    )
    return { next: null, endpointId: due.endpointId, outcome: "cancelled" } as Attempted
  }

  const now = Date.now()
  const timestamp = Math.floor(now / 1000)
  const secrets = [
    due.secretSealed,
    ...(due.overlap && due.previousSecretSealed !== null ? [due.previousSecretSealed] : [])
  ]
  const signatures: Array<string> = []
  for (const sealed of secrets) {
    const secret = yield* sealer.open(sealed).pipe(Effect.orDie)
    signatures.push(yield* Effect.promise(() => signature(Redacted.value(secret), timestamp, due.body)))
  }
  const signed = signatureHeader(timestamp, signatures)
  const extra: Record<string, string> = {}
  for (const h of due.headers) extra[h.key] = Redacted.value(yield* sealer.open(h.sealed).pipe(Effect.orDie))
  const headers = {
    ...extra,
    "Content-Type": "application/json",
    "User-Agent": "Insyte-Webhooks/1.0",
    "Insyte-Event": due.event,
    "Insyte-Delivery": due.id,
    "Insyte-Api-Version": due.apiVersion,
    "Insyte-Signature": signed
  }

  // The name is resolved first: an address inside a network is refused before anything connects.
  const target = hostOf(due.url)
  let refused: string | null = null
  if (target === undefined) refused = "invalid_url"
  else if (target.literal) refused = isPrivateAddress(target.host) ? "private_address" : null
  else {
    // A resolver that does not answer fails the attempt here (`ResolverUnavailable`): ours, so nothing is recorded.
    const addresses = yield* sender.resolve(target.host)
    refused = addresses.length === 0 ? "dns" : addresses.some(isPrivateAddress) ? "private_address" : null
  }
  const result = refused === null
    ? yield* sender.post({ url: due.url, headers, body: due.body })
    : { status: null, ms: 0, error: refused, body: "" }

  const ok = result.status !== null && result.status >= 200 && result.status <= 299
  const attempts = due.attempts + 1
  const told: Array<string> = []
  const settled = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      // Still this run's, and still open: otherwise someone else settled it (a redelivery, a re-armed run), and this
      // attempt counts for nothing.
      const [open] = yield* sql<{ id: string }>`
        select id from webhook_deliveries
        where id = ${deliveryId} and runs = ${run} and outcome in ('pending', 'retrying') for update`
      if (open === undefined) return { stale: true, next: null, endpointId: due.endpointId } as Attempted
      const [endpoint] = yield* sql<{ failures: number; disabled: boolean; active: boolean }>`
        update webhook_endpoints
        set consecutive_failures = case when ${ok} then 0 else consecutive_failures + 1 end
        where id = ${due.endpointId}
        returning consecutive_failures as failures, auto_disabled_at is not null as disabled, active`
      const failures = endpoint?.failures ?? 0
      // The fifth failure in a row switches the endpoint off, once, and whoever manages integrations hears it.
      const switchOff = !ok && endpoint !== undefined && !endpoint.disabled && endpoint.active &&
        failures >= WEBHOOK_AUTO_DISABLE_AFTER
      if (switchOff) {
        yield* sql`update webhook_endpoints set auto_disabled_at = now() where id = ${due.endpointId}`
        yield* Audit.write(sql, due.workspaceId, { kind: "system", id: "system" }, {
          action: "webhook.auto_disabled",
          subjectType: "webhook_endpoint",
          subjectId: due.endpointId,
          section: "webhooks",
          diff: { failures }
        })
        told.push(
          yield* Outbox.write(sql, due.workspaceId, {
            type: "webhook.disabled",
            workspaceId: due.workspaceId,
            userId: "system",
            endpointId: due.endpointId
          })
        )
      }
      const sending = !switchOff && endpoint !== undefined && !endpoint.disabled && endpoint.active
      const again = !ok && attempts < due.maxAttempts && (sending || due.manual)
      const next = again ? now + backoffMs(attempts) : null
      const outcome = ok ? "delivered" : again ? "retrying" : "failed"
      yield* sql`update webhook_deliveries
                 set outcome = ${outcome}, status = ${result.status}, error = ${result.error}, ms = ${result.ms},
                     response_snippet = ${result.body.slice(0, SNIPPET)}, attempts = ${attempts},
                     signature = ${signed}, attempted_at = now(),
                     next_attempt_at = ${next === null ? null : new Date(next)}
                 where id = ${deliveryId}`
      return { next, endpointId: due.endpointId, status: result.status, outcome } as Attempted
    })
  )
  yield* (yield* Relay).kick(told)
  return settled
})

interface DeliveryRow {
  readonly id: string
  readonly endpointId: string
  readonly eventId: string
  readonly event: string
  readonly test: boolean
  readonly status: number | null
  readonly outcome: "pending" | "retrying" | "delivered" | "failed" | "cancelled"
  readonly error: string | null
  readonly attempts: number
  readonly maxAttempts: number
  readonly ms: number | null
  readonly at: Date
  readonly nextAttemptAt: Date | null
}

const toDelivery = (r: DeliveryRow) =>
  new WebhookDeliveryView({
    id: r.id,
    endpointId: r.endpointId,
    eventId: r.eventId,
    event: r.event,
    test: r.test,
    status: r.status,
    outcome: r.outcome,
    error: r.error,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    ms: r.ms,
    at: r.at.getTime(),
    nextAttemptAt: r.nextAttemptAt?.getTime() ?? null
  })

const DELIVERY = (sql: SqlClient.SqlClient) =>
  sql`select id, endpoint_id, event_id, event, test, status, outcome, error, attempts, max_attempts, ms,
             coalesce(attempted_at, created_at) as at, next_attempt_at
      from webhook_deliveries`

/** The stores the principal reaches: the role's, narrowed by the member's own (domain.md §2.4). */
export const reachOf = (principal: { readonly storeScope: ReadonlyArray<string> | null }): StoreAccess =>
  principal.storeScope === null ? "all" : principal.storeScope

/** The deliveries a principal may see in the log: their stores' (a test has none, and is everyone's). */
const fenced = (sql: SqlClient.SqlClient, reach: StoreAccess) =>
  reach === "all" ? sql`true` : sql`(store_id is null or store_id = any(${[...reach]}::text[]))`

/** The area whose records an event carries, which a role must read to see the body. */
const AREA_OF: { readonly [prefix: string]: AreaId } = {
  order: "orders",
  customer: "customers",
  product: "products",
  ticket: "support"
}

/** The endpoint's deliveries, newest first: the last 200 (the log keeps 30 days), of the principal's stores. */
export const deliveries = Effect.fn("Webhooks.deliveries")(function*(endpointId: string) {
  yield* Policy.require("integrations", 1)
  const reach = reachOf(yield* CurrentPrincipal)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<DeliveryRow>`${DELIVERY(sql)} where endpoint_id = ${endpointId} and ${fenced(sql, reach)}
                       order by created_at desc, id desc limit 200`,
      (rows) => rows.map(toDelivery)
    )
  )
})

/**
 * One delivery opened in the drawer: its body, Insyte's signature header, and the start of the answer; the body and
 * the answer only where the role reads the event's area, and the delivery only where it is of the principal's stores.
 */
export const delivery = Effect.fn("Webhooks.delivery")(function*(id: string) {
  yield* Policy.require("integrations", 1)
  const principal = yield* CurrentPrincipal
  const reach = reachOf(principal)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<DeliveryRow>`${DELIVERY(sql)} where id = ${id} and ${fenced(sql, reach)}`
      if (row === undefined) return yield* new NotFound({ entity: "webhook_delivery", id })
      const area = AREA_OF[row.event.split(".")[0] ?? ""]
      const role = principal.role
      const readable = area !== undefined &&
        canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, area, 1)
      const [extra] = yield* sql<{ body: string; signature: string | null; response: string | null }>`
        select body::text as body, signature, response_snippet as response from webhook_deliveries where id = ${id}`
      return new WebhookDeliveryDetail({
        delivery: toDelivery(row),
        body: readable ? JSON.parse(extra!.body) as unknown : null,
        signature: extra!.signature,
        response: readable ? extra!.response : null,
        redacted: !readable
      })
    })
  )
})

const sendable = (sql: SqlClient.SqlClient, endpointId: string) =>
  Effect.gen(function*() {
    const [e] = yield* sql<{ apiVersion: string; active: boolean; disabled: boolean }>`
      select api_version, active, auto_disabled_at is not null as disabled
      from webhook_endpoints where id = ${endpointId} and deleted_at is null`
    if (e === undefined) return yield* new NotFound({ entity: "webhook_endpoint", id: endpointId })
    // "Testevent sturen" and "Opnieuw versturen" go to an endpoint that is on (widgets/05 §5.3, States).
    if (e.disabled) return yield* new Conflict({ entity: "webhook_endpoint", reason: "disabled" })
    if (!e.active) return yield* new Conflict({ entity: "webhook_endpoint", reason: "paused" })
    return e
  })

/**
 * "Testevent sturen": one attempt with an empty `data` and `"test": true`, made as the person and queued like a real
 * delivery; it counts toward the run of failures, as the page says. Answers the delivery, whose result the page reads.
 */
export const sendTest = Effect.fn("Webhooks.sendTest")(function*(endpointId: string, event: string) {
  yield* Policy.require("integrations", 2)
  if (!isWebhookEvent(event)) return yield* new Invalid({ fields: { event: "unknown" } })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const deliveryId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const endpoint = yield* sendable(sql, endpointId)
      const id = mintId("whd")
      const eventId = mintId("evt")
      const body = envelope({
        id: eventId,
        type: event,
        apiVersion: endpoint.apiVersion,
        createdAt: new Date(),
        workspaceId: principal.workspaceId,
        storeId: null,
        data: "{}",
        test: true
      })
      yield* sql`insert into webhook_deliveries (id, workspace_id, endpoint_id, event_id, event, test, body,
                                                 max_attempts)
                 values (${id}, ${principal.workspaceId}, ${endpointId}, ${eventId}, ${event}, true, ${body}::jsonb, 1)`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "webhook.test_sent",
        subjectType: "webhook_endpoint",
        subjectId: endpointId,
        section: "webhooks",
        diff: { event }
      })
      return id
    })
  )
  yield* startRuns(principal.workspaceId, [{ id: deliveryId, runs: 0 }])
  return { deliveryId }
})

/**
 * "Opnieuw versturen": the same body and event id once more, as a new delivery of one attempt; the original stops
 * waiting for its own next attempt.
 */
export const redeliver = Effect.fn("Webhooks.redeliver")(function*(id: string) {
  yield* Policy.require("integrations", 2)
  const principal = yield* CurrentPrincipal
  const reach = reachOf(principal)
  const db = yield* Db
  const deliveryId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [original] = yield* sql<
        { endpointId: string; eventId: string; event: string; test: boolean; storeId: string | null; body: string }
      >`
        select endpoint_id, event_id, event, test, store_id, body::text as body from webhook_deliveries
        where id = ${id} and ${fenced(sql, reach)}
        for update`
      if (original === undefined) return yield* new NotFound({ entity: "webhook_delivery", id })
      yield* sendable(sql, original.endpointId)
      const fresh = mintId("whd")
      yield* sql`insert into webhook_deliveries (id, workspace_id, endpoint_id, event_id, event, store_id, test,
                                                 redelivery_of, body, max_attempts)
                 values (${fresh}, ${principal.workspaceId}, ${original.endpointId}, ${original.eventId},
                         ${original.event}, ${original.storeId}, ${original.test}, ${id}, ${original.body}::jsonb, 1)`
      yield* sql`update webhook_deliveries set outcome = 'cancelled', next_attempt_at = null
                 where id = ${id} and outcome in ('pending', 'retrying')`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "webhook.redelivered",
        subjectType: "webhook_endpoint",
        subjectId: original.endpointId,
        section: "webhooks",
        diff: { delivery: id }
      })
      return fresh
    })
  )
  yield* startRuns(principal.workspaceId, [{ id: deliveryId, runs: 0 }])
  return { deliveryId }
})

/** The retention sweep (domain.md §16): deliveries older than 30 days go, in every workspace. */
export const expire = Effect.fn("Webhooks.expire")(function*() {
  const db = yield* Db
  const [row] = yield* db.unscopedForCron((sql) => sql<{ gone: number }>`select webhook_deliveries_expire() as gone`)
  return row?.gone ?? 0
})

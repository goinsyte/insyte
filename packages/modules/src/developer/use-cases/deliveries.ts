import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
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
 * sent; each delivery then runs on its own (`WebhookRuns`): an attempt posts the body, signed, and records what came
 * back; a failure waits out the backoff and tries again while the endpoint's policy allows. Five failed attempts in a
 * row switch the endpoint off and tell whoever manages the integrations. A test send and "Opnieuw versturen" are
 * deliveries of one attempt each, made by a person.
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

/** A record as the event's `data`, in the v1 shape's snake_case, with the store it belongs to. */
const recordOf = (sql: SqlClient.SqlClient, source: Source) =>
  Effect.gen(function*() {
    switch (source.kind) {
      case "order": {
        const [o] = yield* sql<{ data: string; storeId: string }>`
          select store_id, json_build_object(
                   'id', id, 'number', number, 'store_id', store_id, 'status', status,
                   'payment_status', payment_status, 'fulfillment_status', fulfillment_status,
                   'total', json_build_object('amount_minor', total_minor, 'currency', currency),
                   'customer', json_build_object('id', customer_id, 'name', customer_name, 'email', customer_email),
                   'tags', tags, 'delayed_at', delayed_at)::text as data
          from orders where id = ${source.id}`
        return o === undefined ? undefined : { storeId: o.storeId, data: o.data, archived: false }
      }
      case "customer": {
        const [c] = yield* sql<{ data: string; storeId: string }>`
          select store_id, json_build_object(
                   'id', id, 'store_id', store_id, 'name', name, 'email', email, 'phone', phone,
                   'country', country, 'tags', tags, 'orders_count', orders_count,
                   'lifetime_value', json_build_object('amount_minor', lifetime_value_minor, 'currency', currency))::text
                   as data
          from customers where id = ${source.id}`
        return c === undefined ? undefined : { storeId: c.storeId, data: c.data, archived: false }
      }
      case "product": {
        const [p] = yield* sql<{ data: string; storeId: string; status: string }>`
          select store_id, status, json_build_object(
                   'id', id, 'store_id', store_id, 'title', title, 'handle', handle, 'status', status,
                   'vendor', vendor, 'product_type', product_type, 'tags', tags)::text as data
          from products where id = ${source.id}`
        return p === undefined ? undefined : { storeId: p.storeId, data: p.data, archived: p.status === "archived" }
      }
      case "ticket": {
        const [t] = yield* sql<{ data: string; storeId: string | null }>`
          select t.store_id, json_build_object(
                   'id', t.id, 'number', t.number, 'title', t.title, 'status', t.status, 'priority', t.priority,
                   'assignees', coalesce((select json_agg(a.member_id order by a.member_id)
                                          from ticket_assignees a where a.ticket_id = t.id), '[]'::json))::text as data
          from tickets t where t.id = ${source.id}`
        return t === undefined ? undefined : { storeId: t.storeId, data: t.data, archived: false }
      }
    }
  })

const inStores = (stores: StoreAccess, storeId: string | null) =>
  stores === "all" || storeId === null || stores.includes(storeId)

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

/**
 * The webhooks sink (M19.4): one delivery per public event per endpoint that takes it, on the relay's transaction, and
 * each one's run started. Endpoints that are off, switched off by Insyte or removed get nothing (and keep nothing).
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
  const made: Array<string> = []
  for (const source of sources) {
    const takers = endpoints.filter((e) => e.events.includes(source.type))
    if (takers.length === 0) continue
    const record = yield* recordOf(sql, source)
    if (record === undefined) continue
    if (source.type === "product.archived" && !record.archived) continue
    const eventId = yield* Effect.promise(() => derivedId("evt", outboxId, source.type, source.id))
    for (const endpoint of takers) {
      if (!inStores(endpoint.stores, record.storeId)) continue
      const id = yield* Effect.promise(() => derivedId("whd", eventId, endpoint.id))
      const body = envelope({
        id: eventId,
        type: source.type,
        apiVersion: endpoint.apiVersion,
        createdAt,
        workspaceId: event.workspaceId,
        storeId: record.storeId,
        data: record.data
      })
      const rows = yield* sql<{ id: string }>`
        insert into webhook_deliveries (id, workspace_id, endpoint_id, event_id, event, body, max_attempts)
        values (${id}, ${event.workspaceId}, ${endpoint.id}, ${eventId}, ${source.type}, ${body}::jsonb,
                ${attemptsFor(endpoint.retry)})
        on conflict (id) do nothing returning id`
      if (rows.length > 0) made.push(id)
    }
  }
  const runs = yield* WebhookRuns
  for (const deliveryId of made) yield* runs.start({ workspaceId: event.workspaceId, deliveryId })
  return made
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
}

/** What a run's attempt answers: when to try again (epoch ms), or `null` when the delivery is settled. */
export interface Attempted {
  readonly missing?: boolean
  readonly next: number | null
  readonly endpointId?: string
  readonly status?: number | null
  readonly outcome?: string
}

const SNIPPET = 2048

/**
 * One attempt (in the workspace, as `system`): read what to send, post it signed with nothing held open, record what
 * came back. A delivery whose endpoint was removed, or switched off since it was made, is cancelled instead; a test or
 * a redelivery goes to an endpoint the person could send it to.
 */
export const attempt = Effect.fn("Webhooks.attempt")(function*(deliveryId: string) {
  const db = yield* Db
  const sealer = yield* Sealer
  const sender = yield* WebhookSender
  const [due] = yield* db.scopedFor((sql) =>
    sql<Due>`
      select d.id, d.endpoint_id, d.workspace_id, d.event, d.body::text as body, d.outcome, d.attempts,
             d.max_attempts, (d.test or d.redelivery_of is not null) as manual, e.url, e.secret_sealed,
             e.previous_secret_sealed, coalesce(e.previous_valid_until > now(), false) as overlap, e.headers,
             e.api_version, (e.active and e.auto_disabled_at is null) as sending, e.deleted_at is not null as removed
      from webhook_deliveries d join webhook_endpoints e on e.id = d.endpoint_id
      where d.id = ${deliveryId}`
  )
  if (due === undefined) return { missing: true, next: null } as Attempted
  if (due.outcome === "delivered" || due.outcome === "failed" || due.outcome === "cancelled") {
    return { next: null, endpointId: due.endpointId, outcome: due.outcome } as Attempted
  }
  if (due.removed || (!due.manual && !due.sending)) {
    yield* db.scopedFor((sql) =>
      sql`update webhook_deliveries set outcome = 'cancelled', next_attempt_at = null where id = ${deliveryId}`
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

/** The endpoint's deliveries, newest first: the last 200 (the log keeps 30 days). */
export const deliveries = Effect.fn("Webhooks.deliveries")(function*(endpointId: string) {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<DeliveryRow>`${DELIVERY(sql)} where endpoint_id = ${endpointId} order by created_at desc, id desc limit 200`,
      (rows) => rows.map(toDelivery)
    )
  )
})

/** One delivery opened in the drawer: its body, Insyte's signature header, and the start of the answer. */
export const delivery = Effect.fn("Webhooks.delivery")(function*(id: string) {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<DeliveryRow>`${DELIVERY(sql)} where id = ${id}`
      if (row === undefined) return yield* new NotFound({ entity: "webhook_delivery", id })
      const [extra] = yield* sql<{ body: string; signature: string | null; response: string | null }>`
        select body::text as body, signature, response_snippet as response from webhook_deliveries where id = ${id}`
      return new WebhookDeliveryDetail({
        delivery: toDelivery(row),
        body: JSON.parse(extra!.body) as unknown,
        signature: extra!.signature,
        response: extra!.response
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
  yield* (yield* WebhookRuns).start({ workspaceId: principal.workspaceId, deliveryId })
  return { deliveryId }
})

/**
 * "Opnieuw versturen": the same body and event id once more, as a new delivery of one attempt; the original stops
 * waiting for its own next attempt.
 */
export const redeliver = Effect.fn("Webhooks.redeliver")(function*(id: string) {
  yield* Policy.require("integrations", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const deliveryId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [original] = yield* sql<
        { endpointId: string; eventId: string; event: string; test: boolean; body: string }
      >`
        select endpoint_id, event_id, event, test, body::text as body from webhook_deliveries where id = ${id}
        for update`
      if (original === undefined) return yield* new NotFound({ entity: "webhook_delivery", id })
      yield* sendable(sql, original.endpointId)
      const fresh = mintId("whd")
      yield* sql`insert into webhook_deliveries (id, workspace_id, endpoint_id, event_id, event, test, redelivery_of,
                                                 body, max_attempts)
                 values (${fresh}, ${principal.workspaceId}, ${original.endpointId}, ${original.eventId},
                         ${original.event}, ${original.test}, ${id}, ${original.body}::jsonb, 1)`
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
  yield* (yield* WebhookRuns).start({ workspaceId: principal.workspaceId, deliveryId })
  return { deliveryId }
})

/** The retention sweep (domain.md §16): deliveries older than 30 days go, in every workspace. */
export const expire = Effect.fn("Webhooks.expire")(function*() {
  const db = yield* Db
  const [row] = yield* db.unscopedForCron((sql) => sql<{ gone: number }>`select webhook_deliveries_expire() as gone`)
  return row?.gone ?? 0
})

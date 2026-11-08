import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import { addLine, emptyBatch, flatten, gidOf, type MirrorKind, NODE_QUERY } from "../domain/Mirror.ts"
import { ConnectionGate, IngestQueue, ShopifyAdmin, ShopifyGraphql } from "../domain/Ports.ts"
import { throughGate } from "./backfill.ts"
import { applyBatch } from "./mirror.ts"

/*
 * Shopify's webhooks (M6.3; integrations.md §1.5, §2 "Webhooks", "Compliance"). `receive` runs before the 200: verify the
 * HMAC on the raw bytes (a bad one is 401, as the compliance review requires), find the shop's workspace, write the
 * delivery to `inbound_events` once (the webhook id is the dedupe key), and hand it to the `ingest` queue. `apply` runs
 * in the consumer: a data topic reads its object as it is now and writes it through the same mapper as the backfill,
 * so an out-of-order or replayed delivery cannot roll a row back (the ordering guard); the other topics act on their
 * payload. Privacy requests are answered here: a customer's personal fields are cleared (totals stay for analytics), a
 * shop's records are purged, a data request is kept with its 30 days.
 */

export interface Delivery {
  readonly topic: string
  readonly shop: string
  readonly deliveryId: string
  readonly hmac: string
  readonly body: Uint8Array
}

/** What the route answers Shopify. */
export type Received = { readonly status: 200 | 400 | 401 }

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))

export const receive = Effect.fn("Stores.webhooks.receive")(function*(delivery: Delivery) {
  const shopify = yield* ShopifyAdmin
  if (!(yield* shopify.verifyWebhook(delivery.body, delivery.hmac))) return { status: 401 } satisfies Received
  const body = decodeJson(new TextDecoder().decode(delivery.body))
  if (Option.isNone(body) || delivery.deliveryId === "" || delivery.topic === "") {
    return { status: 400 } satisfies Received
  }
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId; storeId: string }>`
      select workspace_id, store_id from route_shop_any(${delivery.shop.toLowerCase()})`
  )
  // A shop Insyte does not know: acknowledged, so Shopify stops, and nothing is kept.
  if (route === undefined) {
    yield* Effect.logInfo("webhook for an unknown shop", { topic: delivery.topic })
    return { status: 200 } satisfies Received
  }
  const [written] = yield* db.scopedFor((sql) =>
    sql<{ id: string }>`
      insert into inbound_events (id, workspace_id, store_id, provider, delivery_id, topic, account_ref, body_inline)
      values (${mintId("inb")}, ${route.workspaceId}, ${route.storeId}, 'shopify', ${delivery.deliveryId},
              ${delivery.topic}, ${delivery.shop.toLowerCase()}, ${JSON.stringify(body.value)}::jsonb)
      on conflict (provider, delivery_id) do nothing
      returning id`
  ).pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId }))
  // Delivered before: the first one is the one applied.
  if (written !== undefined) {
    yield* (yield* IngestQueue).enqueue({ inboundEventId: written.id, workspaceId: route.workspaceId })
  }
  return { status: 200 } satisfies Received
})

/** The topics whose object is read again and mirrored; the value says which object, from the payload. */
const READS: Record<string, { readonly kind: MirrorKind; readonly id: (body: Record<string, unknown>) => unknown }> = {
  "orders/create": { kind: "Order", id: (b) => b["id"] },
  "orders/updated": { kind: "Order", id: (b) => b["id"] },
  "orders/paid": { kind: "Order", id: (b) => b["id"] },
  "orders/cancelled": { kind: "Order", id: (b) => b["id"] },
  "orders/edited": { kind: "Order", id: (b) => (b["order_edit"] as Record<string, unknown> | undefined)?.["order_id"] },
  "fulfillments/create": { kind: "Order", id: (b) => b["order_id"] },
  "fulfillments/update": { kind: "Order", id: (b) => b["order_id"] },
  "refunds/create": { kind: "Order", id: (b) => b["order_id"] },
  "products/create": { kind: "Product", id: (b) => b["id"] },
  "products/update": { kind: "Product", id: (b) => b["id"] },
  "customers/create": { kind: "Customer", id: (b) => b["id"] },
  "customers/update": { kind: "Customer", id: (b) => b["id"] }
}

interface StoreRow {
  readonly id: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string | null
  readonly status: string
}

/** Applies one received delivery, once; a delivery already applied is left alone. */
export const apply = Effect.fn("Stores.webhooks.apply")(function*(inboundEventId: string) {
  const db = yield* Db
  const [event] = yield* db.scopedFor((sql) =>
    sql<{ topic: string; body: Record<string, unknown>; storeId: string | null; processed: boolean }>`
      update inbound_events set attempts = attempts + 1 where id = ${inboundEventId}
      returning topic, body_inline as body, store_id, processed_at is not null as processed`
  )
  if (event === undefined || event.processed || event.storeId === null) return
  const [store] = yield* db.scopedFor((sql) =>
    sql<
      StoreRow
    >`select id, connection_id, shop_domain as shop, currency, status from stores where id = ${event.storeId}`
  )
  if (store !== undefined) yield* applyTopic(event.topic, event.body, store)
  yield* db.scopedFor((sql) =>
    sql`update inbound_events set processed_at = now(), error = null where id = ${inboundEventId}`
  )
})

const applyTopic = Effect.fn("Stores.webhooks.topic")(
  function*(topic: string, body: Record<string, unknown>, store: StoreRow) {
    const db = yield* Db
    const read = READS[topic]
    if (read !== undefined) {
      // A store that is not connected has no token to read with: the delivery is kept, not applied.
      if (store.status !== "connected" && store.status !== "connecting") return
      const id = read.id(body)
      if (typeof id !== "string" && typeof id !== "number") return
      return yield* mirrorOne(store, read.kind, gidOf(read.kind, id))
    }
    switch (topic) {
      case "products/delete":
        return yield* db.scopedFor((sql) =>
          sql`update products set status = 'archived' where store_id = ${store.id} and shopify_id = ${
            String(body["id"])
          }`
        )
      case "customers/delete":
        return yield* db.scopedFor((sql) =>
          sql`update customers set deleted_at = now() where store_id = ${store.id} and shopify_id = ${
            String(body["id"])
          }`
        )
      case "inventory_levels/update":
        return yield* db.scopedFor((sql) =>
          sql`insert into inventory_levels (workspace_id, variant_id, location_id, available, source, reported_at)
              select app_workspace_id(), v.id, ${String(body["location_id"])}, ${Number(body["available"] ?? 0)},
                     'shopify', now()
              from variants v where v.store_id = ${store.id} and v.inventory_item_id = ${
            String(body["inventory_item_id"])
          }
              on conflict (variant_id, location_id, source) do update
                set available = excluded.available, reported_at = excluded.reported_at`
        )
      case "shop/update":
        return yield* db.scopedFor((sql) =>
          sql`update stores set name = coalesce(${str(body["name"])}, name),
                currency = coalesce(${str(body["currency"])}, currency),
                timezone = coalesce(${str(body["iana_timezone"])}, timezone),
                country = coalesce(${str(body["country_code"])}, country)
              where id = ${store.id}`
        )
      case "app/uninstalled":
        yield* db.scopedFor((sql) =>
          Effect.gen(function*() {
            yield* sql`update stores set status = 'disconnected', disconnected_at = now()
                       where id = ${store.id} and status <> 'disconnected'`
            yield* sql`update connections set status = 'revoked' where id = ${store.connectionId}`
            yield* sql`delete from connection_credentials where connection_id = ${store.connectionId}`
          })
        )
        return yield* (yield* ConnectionGate).forget(store.connectionId)
      case "customers/data_request":
        return yield* gdpr(store, "data_request", body, false)
      case "customers/redact":
        yield* redactCustomer(store, body)
        return yield* gdpr(store, "customer_redact", body, true)
      case "shop/redact":
        yield* purgeShop(store)
        return yield* gdpr(store, "shop_redact", body, true)
      default:
        // `bulk_operations/finish` (the backfill polls), `draft_orders/update` (drafts arrive with M7): nothing to do.
        return
    }
  }
)

const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : null)

/** Reads one object as Shopify holds it now and writes it through the mirror; a deleted one is left as it was. */
export const mirrorOne = Effect.fn("Stores.webhooks.mirror")(
  function*(store: Pick<StoreRow, "id" | "connectionId" | "shop" | "currency">, _kind: MirrorKind, gid: string) {
    const graphql = yield* ShopifyGraphql
    const { data } = yield* throughGate(
      store,
      10,
      (token) => graphql.query(store.shop, token, NODE_QUERY, { id: gid })
    )
    const node = (data as { node?: unknown } | null)?.node
    if (node === null || node === undefined) return
    const batch = emptyBatch()
    for (const line of flatten(node)) addLine(batch, line, store.currency ?? "EUR")
    yield* applyBatch(store.id, batch)
  }
)

const gdpr = Effect.fn("Stores.webhooks.gdpr")(
  function*(store: StoreRow, kind: "data_request" | "customer_redact" | "shop_redact", body: unknown, done: boolean) {
    const db = yield* Db
    const customer = (body as { customer?: { id?: unknown } }).customer?.id
    yield* db.scopedFor((sql) =>
      sql`insert into gdpr_requests (id, workspace_id, store_id, kind, customer_shopify_id, payload, due_at, completed_at)
          values (${mintId("gdpr")}, app_workspace_id(), ${kind === "shop_redact" ? null : store.id}, ${kind},
                  ${customer === undefined ? null : String(customer)}, ${JSON.stringify(body)}::jsonb,
                  now() + interval '30 days', case when ${done} then now() end)`
    )
  }
)

/** Clears a customer's personal fields, and their orders'; amounts, dates and statuses stay for the figures. */
const redactCustomer = Effect.fn("Stores.webhooks.redactCustomer")(function*(store: StoreRow, body: unknown) {
  const db = yield* Db
  const payload = body as { customer?: { id?: unknown }; orders_to_redact?: ReadonlyArray<unknown> }
  const customer = payload.customer?.id === undefined ? "" : String(payload.customer.id)
  const orders = (payload.orders_to_redact ?? []).map(String)
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update customers set email = null, name = '', phone = null, address = null, raw = '{}'::jsonb,
                   deleted_at = coalesce(deleted_at, now())
                 where store_id = ${store.id} and shopify_id = ${customer}`
      yield* sql`update orders set customer_name = '', customer_email = null, shipping_address = null, note = null,
                   raw = '{}'::jsonb
                 where store_id = ${store.id} and (customer_shopify_id = ${customer} or shopify_id = any(${orders}))`
    })
  )
})

/** Shopify's `shop/redact`, 48 hours after an uninstall: the store's mirror goes; the store row stays, disconnected. */
const purgeShop = Effect.fn("Stores.webhooks.purgeShop")(function*(store: StoreRow) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      // Children cascade from their parents.
      yield* sql`delete from orders where store_id = ${store.id}`
      yield* sql`delete from products where store_id = ${store.id}`
      yield* sql`delete from customers where store_id = ${store.id}`
      yield* sql`update stores set status = 'disconnected', disconnected_at = coalesce(disconnected_at, now()),
                   policies = '{}', ships_to = '{}', payment_methods = '{}'
                 where id = ${store.id}`
    })
  )
})

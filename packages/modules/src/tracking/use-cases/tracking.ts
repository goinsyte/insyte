import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { OrderTracking, Tracking, type TrackingSnapshot } from "../domain/Tracking.ts"

/*
 * Parcels, tracked (M8.4). The mirror makes a delivery for each parcel with a tracking number (`ensureDeliveries`). The
 * 15-minute sweep registers new ones with AfterShip, polls those it has not heard about for four hours, and flags a
 * parcel that has not moved for three days. AfterShip's webhook and the poll land in `ingest`: a parcel delivered,
 * and every parcel of its order delivered, delivers the order (Insyte's word stands against Shopify's older `shipped`);
 * a carrier exception, or no movement, delays the order once and tells the team (`order.delayed`, `order.late`).
 */

/** No movement for this long is a delay (the workspace's own `alerts.delay_hours` setting is not built yet). */
const DELAY_HOURS = 72
const POLL_HOURS = 4
const PER_SWEEP = 50

/** A delivery per new parcel with a tracking number, in the page the mirror just wrote. One Shopify already reports
 * delivered starts delivered: nothing to register, nothing to poll. */
export const ensureDeliveries = Effect.fn("Tracking.ensureDeliveries")(function*(
  sql: SqlClient.SqlClient,
  storeId: string,
  fulfilmentShopifyIds: ReadonlyArray<string>
) {
  if (fulfilmentShopifyIds.length === 0) return
  const fresh = yield* sql<{
    fulfilmentId: string
    orderId: string
    carrier: string | null
    trackingNumber: string
    delivered: boolean
    deliveredAt: Date | null
  }>`
    select f.id as fulfilment_id, f.order_id, f.carrier, f.tracking_number,
           f.tracking_status = 'delivered' or f.delivered_at is not null as delivered, f.delivered_at
    from fulfilments f
    where f.store_id = ${storeId} and f.shopify_id in ${sql.in([...new Set(fulfilmentShopifyIds)])}
      and f.tracking_number is not null and f.tracking_number <> ''
      and not exists (select 1 from deliveries d where d.fulfilment_id = f.id)`
  if (fresh.length === 0) return
  yield* sql`
    insert into deliveries (id, workspace_id, order_id, fulfilment_id, carrier, tracking_number, status, delivered_at)
    select r.id, app_workspace_id(), r.order_id, r.fulfilment_id, r.carrier, r.tracking_number,
           case when r.delivered then 'delivered' else 'pending' end, r.delivered_at
    from jsonb_to_recordset(${
    JSON.stringify(fresh.map((f) => ({
      id: mintId("dlv"),
      order_id: f.orderId,
      fulfilment_id: f.fulfilmentId,
      carrier: f.carrier,
      tracking_number: f.trackingNumber,
      delivered: f.delivered,
      delivered_at: f.deliveredAt
    })))
  }::jsonb) as r(id text, order_id text, fulfilment_id text, carrier text, tracking_number text, delivered boolean,
                 delivered_at timestamptz)
    on conflict (fulfilment_id) do nothing`
})

/** Marks the order delayed, once, and tells the team. */
const delay = (sql: SqlClient.SqlClient, orderId: string, reason: "exception" | "no_movement", note: string | null) =>
  Effect.gen(function*() {
    const marked = yield* sql<{ workspaceId: string }>`
      update orders set delayed_at = now() where id = ${orderId} and delayed_at is null
        and status not in ('delivered', 'cancelled', 'refunded')
      returning workspace_id`
    const ws = marked[0]
    if (ws === undefined) return
    yield* Outbox.write(sql, ws.workspaceId, {
      type: "order.delayed",
      workspaceId: ws.workspaceId,
      userId: "system",
      orderIds: [orderId],
      reason,
      note
    })
  })

/** What AfterShip said of one delivery, applied. */
export const ingest = Effect.fn("Tracking.ingest")(function*(
  sql: SqlClient.SqlClient,
  deliveryId: string,
  snapshot: TrackingSnapshot
) {
  const [row] = yield* sql<{ orderId: string }>`
    update deliveries set status = ${snapshot.status}, checkpoint = ${snapshot.checkpoint},
      exception = ${snapshot.exception}, estimated_delivery = ${snapshot.estimatedDelivery},
      delivered_at = coalesce(${snapshot.deliveredAt}, case when ${snapshot.status} = 'delivered' then coalesce(delivered_at, now()) end),
      last_event_at = coalesce(${snapshot.lastEventAt}, last_event_at), polled_at = now(), error = null
    where id = ${deliveryId}
    returning order_id`
  if (row === undefined) return
  if (snapshot.status === "delivered") {
    // Every parcel delivered, by either word: the order is.
    yield* sql`
      update orders o set status = 'delivered'
      where o.id = ${row.orderId} and o.status in ('shipped', 'at_supplier', 'paid')
        and not exists (
          select 1 from fulfilments f left join deliveries d on d.fulfilment_id = f.id
          where f.order_id = o.id and coalesce(d.status, f.tracking_status, 'pending') <> 'delivered'
            and coalesce(f.tracking_status, '') <> 'delivered')`
  }
  if (snapshot.status === "exception") yield* delay(sql, row.orderId, "exception", snapshot.exception)
})

/** One workspace's turn of the sweep: register, poll, and flag what has not moved. */
export const sweepWorkspace = Effect.fn("Tracking.sweepWorkspace")(function*() {
  const tracking = yield* Tracking
  const db = yield* Db
  if (tracking.configured) {
    const unregistered = yield* db.scopedFor((sql) =>
      sql<{ id: string; trackingNumber: string; carrier: string | null; number: string }>`
        select d.id, d.tracking_number, d.carrier, o.number from deliveries d join orders o on o.id = d.order_id
        where d.aftership_id is null and d.attempts < 10 and d.status not in ('delivered', 'expired', 'returned')
        order by d.created_at limit ${PER_SWEEP}`
    )
    for (const d of unregistered) {
      const registered = yield* tracking.register({
        deliveryId: d.id,
        trackingNumber: d.trackingNumber,
        carrier: d.carrier,
        title: d.number
      }).pipe(Effect.result)
      yield* db.scopedFor((sql) =>
        registered._tag === "Success"
          ? sql`update deliveries set aftership_id = ${registered.success.aftershipId},
                  slug = ${registered.success.slug}, registered_at = now(), error = null where id = ${d.id}`
          : sql`update deliveries set attempts = attempts + ${registered.failure.retryable ? 1 : 10},
                  error = ${registered.failure.reason} where id = ${d.id}`
      )
    }
    const stale = yield* db.scopedFor((sql) =>
      sql<{ id: string; aftershipId: string }>`
        select id, aftership_id from deliveries
        where aftership_id is not null and status not in ('delivered', 'expired', 'returned')
          and (polled_at is null or polled_at < now() - make_interval(hours => ${POLL_HOURS}))
        order by polled_at nulls first limit ${PER_SWEEP}`
    )
    for (const d of stale) {
      const now = yield* tracking.get(d.aftershipId).pipe(Effect.result)
      yield* db.scopedFor((sql) =>
        now._tag === "Success"
          ? ingest(sql, d.id, now.success)
          : sql`update deliveries set polled_at = now(), error = ${now.failure.reason} where id = ${d.id}`
      )
    }
  }
  // A parcel on its way that has not moved for three days: late, whatever AfterShip says.
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const still = yield* sql<{ orderId: string }>`
        select distinct d.order_id from deliveries d join orders o on o.id = d.order_id
        where d.status in ('pending', 'in_transit', 'out_for_delivery') and o.delayed_at is null
          and coalesce(d.last_event_at, d.registered_at, d.created_at) < now() - make_interval(hours => ${DELAY_HOURS})`
      for (const s of still) yield* delay(sql, s.orderId, "no_movement", null)
    })
  )
})

/** The 15-minute sweep, over every workspace with parcels to look after. */
export const sweep = Effect.fn("Tracking.sweep")(function*() {
  const db = yield* Db
  const due = yield* db.routing((sql) => sql<{ workspaceId: WorkspaceId }>`select workspace_id from deliveries_due()`)
  for (const { workspaceId } of due) {
    yield* sweepWorkspace().pipe(
      Effect.provideService(CurrentWorkspace, { id: workspaceId }),
      Effect.catchCause((cause) => Effect.logWarning("tracking sweep failed for a workspace", { workspaceId, cause }))
    )
  }
})

/** AfterShip's webhook: verified on the raw bytes, then the delivery it names, in its workspace. Always 200 once
 * verified, so AfterShip does not retry what Insyte does not know. */
export const receive = Effect.fn("Tracking.receive")(function*(input: { body: Uint8Array; signature: string }) {
  const tracking = yield* Tracking
  if (!(yield* tracking.verifyWebhook(input.body, input.signature))) return 401 as const
  const parsed = (() => {
    try {
      return JSON.parse(new TextDecoder().decode(input.body)) as unknown
    } catch {
      return undefined
    }
  })()
  const read = tracking.readWebhook(parsed)
  if (read === undefined) return 200 as const
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from route_delivery(${read.deliveryId})`
  )
  if (route === undefined) return 200 as const
  yield* db.scopedFor((sql) => ingest(sql, read.deliveryId, read.snapshot)).pipe(
    Effect.provideService(CurrentWorkspace, { id: route.workspaceId })
  )
  return 200 as const
})

/** `Orders.tracking`: the order's parcels and where they are, at `orders` Bekijken inside the role's stores. */
export const forOrder = Effect.fn("Orders.tracking")(function*(orderId: string) {
  yield* Policy.require("orders", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [order] = yield* sql<{ delayedAt: Date | null }>`
        select o.delayed_at from orders o where o.id = ${orderId} and ${yield* inScope(sql, "o.store_id")}`
      if (order === undefined) return yield* new NotFound({ entity: "order", id: orderId })
      const parcels = yield* sql<{
        id: string
        deliveryId: string | null
        carrier: string | null
        trackingNumber: string | null
        trackingUrl: string | null
        shippedAt: Date | null
        status: OrderTracking["parcels"][number]["status"]
        checkpoint: string | null
        exception: string | null
        estimatedDelivery: Date | null
        deliveredAt: Date | null
        lastEventAt: Date | null
      }>`
        select f.id, d.id as delivery_id, coalesce(f.carrier, d.slug) as carrier, f.tracking_number, f.tracking_url, f.shipped_at,
               -- AfterShip's word once it has one; until then Shopify's.
               case when d.status is null or d.status = 'pending' then coalesce(f.tracking_status, d.status)
                    else d.status end as status, d.checkpoint, d.exception, d.estimated_delivery,
               coalesce(d.delivered_at, f.delivered_at) as delivered_at, d.last_event_at
        from fulfilments f left join deliveries d on d.fulfilment_id = f.id
        where f.order_id = ${orderId} order by f.shipped_at nulls last, f.id`
      const all = parcels.length > 0 && parcels.every((p) => p.status === "delivered")
      return new OrderTracking({
        orderId,
        parcels: parcels.map((p) => ({
          ...p,
          shippedAt: p.shippedAt?.getTime() ?? null,
          estimatedDelivery: p.estimatedDelivery?.getTime() ?? null,
          deliveredAt: p.deliveredAt?.getTime() ?? null,
          lastEventAt: p.lastEventAt?.getTime() ?? null
        })),
        delayedAt: order.delayedAt?.getTime() ?? null,
        deliveredAt: all ? Math.max(...parcels.map((p) => p.deliveredAt?.getTime() ?? 0)) : null
      })
    })
  )
})

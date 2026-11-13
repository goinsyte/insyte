import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { ConnectionGate } from "../domain/Ports.ts"
import { type StoreStatus, StoreView, SyncStatus } from "../domain/Stores.ts"

/*
 * Instellingen → Winkels (M6.2): the workspace's stores, read at `settings` Bekijken; disconnecting one is Beheren.
 * Disconnecting keeps the store's records (Shopify's `shop/redact` purges them 48 hours after an uninstall, M6.3) and
 * forgets its tokens at once.
 */

interface Row {
  readonly id: string
  readonly name: string
  readonly shopDomain: string
  readonly status: StoreStatus
  readonly currency: string | null
  readonly country: string | null
  readonly timezone: string | null
  readonly connectedAt: Date | null
  readonly lastSyncedAt: Date | null
}

export const readStores = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<Row>`select id, name, shop_domain, status, currency, country, timezone, connected_at, last_synced_at
             from stores order by status = 'disconnected', created_at`,
    (rows) =>
      rows.map((r) =>
        new StoreView({
          ...r,
          connectedAt: r.connectedAt?.getTime() ?? null,
          lastSyncedAt: r.lastSyncedAt?.getTime() ?? null
        })
      )
  )

export const list = Effect.fn("Stores.list")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  return yield* db.scoped(readStores)
})

/** A store's first import as far as it got: each resource's phase and the mirror's counts. */
export const syncStatus = Effect.fn("Stores.syncStatus")(function*(id: string) {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [store] = yield* sql<{ status: StoreStatus; lastSyncedAt: Date | null; connectionId: string }>`
        select status, last_synced_at, connection_id from stores where id = ${id}`
      if (store === undefined) return yield* new NotFound({ entity: "store", id })
      const cursors = yield* sql<{ resource: "products" | "customers" | "orders"; phase: string | null }>`
        select resource, backfill_state ->> 'phase' as phase from sync_cursors
        where connection_id = ${store.connectionId} and resource in ('products', 'customers', 'orders')
        order by array_position(array['products', 'customers', 'orders'], resource)`
      const [counts] = yield* sql<{ products: number; customers: number; orders: number }>`
        select (select count(*) from products where store_id = ${id})::int as products,
               (select count(*) from customers where store_id = ${id})::int as customers,
               (select count(*) from orders where store_id = ${id})::int as orders`
      return new SyncStatus({
        storeId: id,
        status: store.status,
        lastSyncedAt: store.lastSyncedAt?.getTime() ?? null,
        counts: counts ?? { products: 0, customers: 0, orders: 0 },
        resources: cursors.map((c) => ({
          resource: c.resource,
          phase: c.phase === "running" || c.phase === "reading" || c.phase === "done" ? c.phase : "queued"
        }))
      })
    })
  )
})

export const disconnect = Effect.fn("Stores.disconnect")(function*(id: string) {
  yield* Policy.require("settings", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const result = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [store] = yield* sql<{ connectionId: string }>`
        select connection_id from stores where id = ${id} and status <> 'disconnected' for update`
      if (store === undefined) return yield* new NotFound({ entity: "store", id })
      yield* sql`update stores set status = 'disconnected', disconnected_at = now() where id = ${id}`
      yield* sql`update connections set status = 'disconnected' where id = ${store.connectionId}`
      yield* sql`delete from connection_credentials where connection_id = ${store.connectionId}`
      // A store let go is not an unhealthy one: what was open about its connection ends with it.
      yield* sql`update connection_incidents set resolved_at = now()
                 where connection_id = ${store.connectionId} and resolved_at is null`
      yield* Audit.write(sql, principal.workspaceId, { kind: "member", id: principal.id }, {
        action: "store.disconnected",
        subjectType: "store",
        subjectId: id
      })
      return { connectionId: store.connectionId, stores: yield* readStores(sql) }
    })
  )
  // The gate holds the token in memory until it lapses: it lets go now, so nothing reads the store again.
  yield* (yield* ConnectionGate).forget(result.connectionId)
  return result.stores
})

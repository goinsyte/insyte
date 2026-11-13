import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { throughGate } from "../domain/Gate.ts"
import { addLine, changedQuery, emptyBatch, flatten, type MirrorKind } from "../domain/Mirror.ts"
import { ShopifyGraphql } from "../domain/Ports.ts"
import { applyBatch } from "./mirror.ts"

/*
 * The reconcile sweep (M6.3; integrations.md §1.6): every fifteen minutes, per connected store and resource, what
 * changed in Shopify since the watermark, written through the same mapper as the backfill. It repairs the deliveries
 * Shopify gave up on (eight tries over four hours) and anything a webhook missed. The watermark moves to the newest
 * change seen; a minute's overlap reads a boundary twice, which the upserts make harmless. A sweep reads a few pages
 * per resource and leaves the rest for the next one; while a webhook gap is open on the store (sync health, M17 step 6)
 * it reads more, so the gap the check rewound it to fills in within a few sweeps. It also answers what the health check
 * needs of it: how close Shopify's bucket came to empty.
 */

const RESOURCES: ReadonlyArray<{ readonly kind: MirrorKind; readonly resource: string; readonly field: string }> = [
  { kind: "Product", resource: "products", field: "products" },
  { kind: "Customer", resource: "customers", field: "customers" },
  { kind: "Order", resource: "orders", field: "orders" }
]

const PAGES_PER_SWEEP = 5
/** While webhooks are not coming, the sweep is the store's only feed: it reads this many pages per resource. */
const PAGES_IN_GAP = 20
const OVERLAP_MS = 60_000

interface Page {
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }
  readonly edges: ReadonlyArray<{ readonly node: { readonly updatedAt?: string } }>
}

/** What one store's sweep did: how many objects it read, and the lowest share of the bucket Shopify said was left. */
export interface Reconciled {
  readonly read: number
  readonly headroom: number | null
}

/** Reconciles one store; `null` when it is not one to read (not connected, or not imported yet). */
export const reconcileStore = Effect.fn("Stores.reconcile")(function*(storeId: string) {
  const db = yield* Db
  const graphql = yield* ShopifyGraphql
  const [store] = yield* db.scopedFor((sql) =>
    sql<{
      connectionId: string
      shop: string
      currency: string | null
      lastSyncedAt: Date | null
      status: string
      gap: boolean
    }>`
      select s.connection_id, s.shop_domain as shop, s.currency, s.last_synced_at, s.status,
             exists (select 1 from connection_incidents i where i.connection_id = s.connection_id
                     and i.kind = 'webhook_gap' and i.resolved_at is null) as gap
      from stores s where s.id = ${storeId}`
  )
  if (store === undefined || store.status !== "connected" || store.lastSyncedAt === null) return null
  const pages = store.gap ? PAGES_IN_GAP : PAGES_PER_SWEEP
  let read = 0
  let headroom: number | null = null
  for (const { kind, resource, field } of RESOURCES) {
    const [cursor] = yield* db.scopedFor((sql) =>
      sql<{ watermarkAt: Date | null }>`
        select watermark_at from sync_cursors where connection_id = ${store.connectionId} and resource = ${resource}`
    )
    const since = new Date((cursor?.watermarkAt ?? store.lastSyncedAt).getTime() - OVERLAP_MS)
    let after: string | null = null
    let newest = since
    for (let page = 0; page < pages; page++) {
      const { data, throttle } = yield* throughGate(
        store,
        50,
        (token) =>
          graphql.query(store.shop, token, changedQuery(kind), {
            q: `updated_at:>='${since.toISOString()}'`,
            after
          })
      )
      if (throttle !== null && throttle.maximumAvailable > 0) {
        const left = throttle.currentlyAvailable / throttle.maximumAvailable
        headroom = headroom === null ? left : Math.min(headroom, left)
      }
      const answer = (data as Record<string, Page | undefined> | null)?.[field]
      if (answer === undefined) break
      const batch = emptyBatch()
      for (const { node } of answer.edges) {
        for (const line of flatten(node)) addLine(batch, line, store.currency ?? "EUR")
        const at = node.updatedAt === undefined ? undefined : new Date(node.updatedAt)
        if (at !== undefined && at > newest) newest = at
      }
      yield* applyBatch(storeId, batch)
      read += answer.edges.length
      if (!answer.pageInfo.hasNextPage || answer.pageInfo.endCursor === null) break
      after = answer.pageInfo.endCursor
    }
    // The last resource read through is the connection's sync (sync health's "gesynchroniseerd"), in the same
    // statement: a sweep that went through clears the failures counted against it.
    yield* db.scopedFor((sql) =>
      resource === RESOURCES.at(-1)!.resource
        ? sql`with moved as (
                update sync_cursors set watermark_at = greatest(coalesce(watermark_at, ${since}), ${newest})
                where connection_id = ${store.connectionId} and resource = ${resource} returning 1)
              update connections set last_synced_at = now(), health = health - 'failures'
              where id = ${store.connectionId}`
        : sql`update sync_cursors set watermark_at = greatest(coalesce(watermark_at, ${since}), ${newest})
              where connection_id = ${store.connectionId} and resource = ${resource}`
    )
  }
  return { read, headroom } satisfies Reconciled as Reconciled | null
})

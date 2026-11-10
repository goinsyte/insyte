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
 * per resource and leaves the rest for the next one.
 */

const RESOURCES: ReadonlyArray<{ readonly kind: MirrorKind; readonly resource: string; readonly field: string }> = [
  { kind: "Product", resource: "products", field: "products" },
  { kind: "Customer", resource: "customers", field: "customers" },
  { kind: "Order", resource: "orders", field: "orders" }
]

const PAGES_PER_SWEEP = 5
const OVERLAP_MS = 60_000

interface Page {
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }
  readonly edges: ReadonlyArray<{ readonly node: { readonly updatedAt?: string } }>
}

/** Reconciles one store; answers how many objects it read. */
export const reconcileStore = Effect.fn("Stores.reconcile")(function*(storeId: string) {
  const db = yield* Db
  const graphql = yield* ShopifyGraphql
  const [store] = yield* db.scopedFor((sql) =>
    sql<{ connectionId: string; shop: string; currency: string | null; lastSyncedAt: Date | null; status: string }>`
      select connection_id, shop_domain as shop, currency, last_synced_at, status from stores where id = ${storeId}`
  )
  if (store === undefined || store.status !== "connected" || store.lastSyncedAt === null) return 0
  let read = 0
  for (const { kind, resource, field } of RESOURCES) {
    const [cursor] = yield* db.scopedFor((sql) =>
      sql<{ watermarkAt: Date | null }>`
        select watermark_at from sync_cursors where connection_id = ${store.connectionId} and resource = ${resource}`
    )
    const since = new Date((cursor?.watermarkAt ?? store.lastSyncedAt).getTime() - OVERLAP_MS)
    let after: string | null = null
    let newest = since
    for (let page = 0; page < PAGES_PER_SWEEP; page++) {
      const { data } = yield* throughGate(
        store,
        50,
        (token) =>
          graphql.query(store.shop, token, changedQuery(kind), {
            q: `updated_at:>='${since.toISOString()}'`,
            after
          })
      )
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
    yield* db.scopedFor((sql) =>
      sql`update sync_cursors set watermark_at = greatest(coalesce(watermark_at, ${since}), ${newest})
          where connection_id = ${store.connectionId} and resource = ${resource}`
    )
  }
  return read
})

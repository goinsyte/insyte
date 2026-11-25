import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Cause, Effect, Exit } from "effect"
import { throughGate } from "../domain/Gate.ts"
import { HEADROOM_LOW } from "../domain/Health.ts"
import { addLine, changedPage, changedQuery, emptyBatch, type MirrorKind } from "../domain/Mirror.ts"
import { ShopifyGraphql } from "../domain/Ports.ts"
import { applyBatch } from "./mirror.ts"
import { connectionAt, wholeNode } from "./reads.ts"
import { retireCompletedDrafts } from "./webhooks.ts"

/*
 * The reconcile sweep (M6.3; integrations.md §1.6): every fifteen minutes, per connected store and resource, what
 * changed in Shopify since the watermark, written through the same mapper as the backfill. It repairs the deliveries
 * Shopify gave up on (eight tries over four hours) and anything a webhook missed. The watermark moves to the newest
 * change seen; a minute's overlap reads a boundary twice, which the upserts make harmless. A sweep reads up to a
 * hundred objects per resource, oldest change first and each whole (`wholeNode`), and leaves the rest for the next one.
 *
 * Sync health (M17 step 6) reads what each sweep saw, from the connection: the sweep writes it there (a sweep that went
 * through, one that failed and why, how close Shopify's bucket came to empty, the orders' watermark), so the check runs
 * on its own and never waits for a sweep. While a webhook gap is open on the store the orders are read with more pages,
 * out of an allowance the whole run shares (`gapPages`), since the sweep is then the store's only feed of orders.
 *
 * Last, the drafts Insyte made (M7.1) that Shopify completed but whose webhook never got through are retired into the
 * orders they became (`retireCompletedDrafts`); that look failing is logged and leaves the sweep's outcome alone.
 *
 * The run (`storesToReconcile`, then `sweepStores`): every connected, imported store, one at a time and each in its own
 * workspace, the one whose connection went longest without a sweep first. One store's failure is logged and counted on
 * its connection, and the rest go on. It stops starting stores after `SWEEP_BUDGET_MS`, and the next run starts where
 * this one stopped.
 */

const RESOURCES: ReadonlyArray<{ readonly kind: MirrorKind; readonly resource: string; readonly field: string }> = [
  { kind: "Product", resource: "products", field: "products" },
  { kind: "Customer", resource: "customers", field: "customers" },
  { kind: "Order", resource: "orders", field: "orders" }
]

/**
 * What a sweep reads of a resource at most, in objects. A page holds as many as Shopify's cost limit lets it
 * (`changedPage`: ten products, a hundred customers, two orders), so a resource takes as many pages as it needs for
 * these; a store with little changed reads one.
 */
const OBJECTS_PER_SWEEP = 100
/** While order webhooks are not coming, the orders are read up to this many, the extra pages out of the run's. */
const OBJECTS_IN_GAP = 300
const OVERLAP_MS = 60_000
/** What the gate holds back for a read: about what one costs Shopify once read (its requested cost is higher). */
const PAGE_COST = 50

/** What one store's sweep did: how many objects it read, and how many of the run's extra gap pages it used. */
export interface Reconciled {
  readonly read: number
  readonly headroom: number | null
  readonly gapPages: number
}

/**
 * Reconciles one store, with up to `gapPages` extra pages of orders if a webhook gap is open on it; `null` when it is
 * not one to read (not connected, or not imported yet).
 */
export const reconcileStore = Effect.fn("Stores.reconcile")(function*(storeId: string, gapPages = 0) {
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
  let read = 0
  let headroom: number | null = null
  let extra = 0
  /** One read through the gate, noting how close Shopify's bucket came to empty. */
  const ask = (query: string, variables: Record<string, unknown>) =>
    throughGate(store, PAGE_COST, (token) => graphql.query(store.shop, token, query, variables)).pipe(
      Effect.tap(({ throttle }) =>
        Effect.sync(() => {
          if (throttle === null || throttle.maximumAvailable <= 0) return
          const left = throttle.currentlyAvailable / throttle.maximumAvailable
          headroom = headroom === null ? left : Math.min(headroom, left)
        })
      )
    )
  for (const { kind, resource, field } of RESOURCES) {
    const usual = Math.ceil(OBJECTS_PER_SWEEP / changedPage(kind))
    const pages = resource === "orders" && store.gap
      ? usual + Math.max(0, Math.min(gapPages, Math.ceil(OBJECTS_IN_GAP / changedPage(kind)) - usual))
      : usual
    const [cursor] = yield* db.scopedFor((sql) =>
      sql<{ watermarkAt: Date | null }>`
        select watermark_at from sync_cursors where connection_id = ${store.connectionId} and resource = ${resource}`
    )
    const since = new Date((cursor?.watermarkAt ?? store.lastSyncedAt).getTime() - OVERLAP_MS)
    let after: string | null = null
    let newest = since
    for (let page = 0; page < pages; page++) {
      if (page >= usual) extra++
      const { data } = yield* ask(changedQuery(kind), { q: `updated_at:>='${since.toISOString()}'`, after })
      const answer = connectionAt(data, [field])
      if (answer === undefined) break
      const batch = emptyBatch()
      for (const { node } of answer.edges) {
        // Each object whole: its children past the page's first are read before the page is written.
        for (const line of yield* wholeNode(node, ask)) addLine(batch, line, store.currency ?? "EUR")
        const at = typeof node["updatedAt"] === "string" ? new Date(node["updatedAt"]) : undefined
        if (at !== undefined && at > newest) newest = at
      }
      yield* applyBatch(storeId, batch)
      read += answer.edges.length
      if (answer.pageInfo?.hasNextPage !== true || answer.pageInfo.endCursor === null) break
      after = answer.pageInfo.endCursor
    }
    // The orders come last: their watermark, and the sweep's outcome, go on the connection in the same statement. A
    // sweep that went through clears the failures counted against it, and counts toward the rate limit or away.
    const low = headroom !== null && headroom < HEADROOM_LOW
    yield* db.scopedFor((sql) =>
      resource === RESOURCES.at(-1)!.resource
        ? sql`with moved as (
                update sync_cursors set watermark_at = greatest(coalesce(watermark_at, ${since}), ${newest})
                where connection_id = ${store.connectionId} and resource = ${resource} returning watermark_at)
              update connections set last_synced_at = now(),
                health = (health - 'failures' - 'failure') || jsonb_build_object(
                  'ordersWatermarkAt', (select watermark_at from moved),
                  'lowSweeps', case when ${low} then coalesce((health ->> 'lowSweeps')::int, 0) + 1 else 0 end,
                  'calmSweeps', case when ${low} then 0 else least(coalesce((health ->> 'calmSweeps')::int, 0) + 1, 10) end,
                  'headroom', ${headroom === null ? null : Math.round(headroom * 100) / 100}::float8)
              where id = ${store.connectionId}`
        : sql`update sync_cursors set watermark_at = greatest(coalesce(watermark_at, ${since}), ${newest})
              where connection_id = ${store.connectionId} and resource = ${resource}`
    )
  }
  yield* retireCompletedDrafts({ id: storeId, ...store }).pipe(
    Effect.catchCause((cause) => Effect.logWarning("completed drafts were not looked at", { storeId, cause }))
  )
  return { read, headroom, gapPages: extra } satisfies Reconciled as Reconciled | null
})

/** A sweep of the store that failed: counted on its connection, with why, for the health check. */
export const noteFailure = Effect.fn("Stores.reconcile.failed")(function*(storeId: string, reason: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update connections c set last_error_at = now(),
          health = c.health || jsonb_build_object('failures', coalesce((c.health ->> 'failures')::int, 0) + 1,
                                                  'failure', ${reason}::text)
        from stores s where s.id = ${storeId} and c.id = s.connection_id`
  )
})

/**
 * A sweep Shopify throttled: near the rate limit, with no room left. Not a failure (the rest is read next sweep), and
 * not a store left unread: the failures counted against it stay as they were.
 */
export const noteThrottled = Effect.fn("Stores.reconcile.throttled")(function*(storeId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update connections c set
          health = c.health || jsonb_build_object('lowSweeps', coalesce((c.health ->> 'lowSweeps')::int, 0) + 1,
                                                  'calmSweeps', 0, 'headroom', 0, 'throttledAt', now())
        from stores s where s.id = ${storeId} and c.id = s.connection_id`
  )
})

/**
 * One store's turn in the sweep: reconciled, or its failure logged and counted on its connection (a refused grant is the
 * connection's own status, `token_expired`, which the check reads; a throttled sweep is near the rate limit, not a
 * failure). Never fails. Answers how many of the run's extra gap pages it used.
 */
export const sweepStore = Effect.fn("Stores.sweepStore")(function*(storeId: string, gapPages = 0) {
  const exit = yield* Effect.exit(reconcileStore(storeId, gapPages))
  if (Exit.isSuccess(exit)) return exit.value?.gapPages ?? 0
  yield* Effect.logWarning("reconcile failed for a store", { storeId, cause: exit.cause })
  const found = Cause.findErrorOption(exit.cause)
  const error = found._tag === "Some" ? (found.value as { _tag?: string; reason?: string }) : undefined
  if (error?._tag === "TokenRefused" && error.reason === "expired") return 0
  const noted = error?._tag === "ShopifyThrottled"
    ? noteThrottled(storeId)
    // A token the gate cannot find (no credentials, or the connection is not connected) is a sweep that failed.
    : noteFailure(storeId, error?._tag === "TokenRefused" ? "credentials" : error?._tag ?? "defect")
  yield* noted.pipe(
    Effect.catchCause((cause) => Effect.logWarning("a sweep's outcome was not kept", { storeId, cause }))
  )
  return 0
})

/** A run stops starting stores after this long: the cron's limit is fifteen minutes, and the next run comes then. */
const SWEEP_BUDGET_MS = 10 * 60_000
/** Extra pages of orders one run reads, over all the stores with a webhook gap: a wide outage cannot stall it. */
const GAP_PAGES_PER_SWEEP = 200

/** A store the run reads, by id only. */
export interface ToReconcile {
  readonly workspaceId: string
  readonly storeId: string
}

/**
 * The stores a run reads, across workspaces and ids only (`stores_to_reconcile()`): every connected, imported store,
 * the one whose connection went longest without a sweep first.
 */
export const storesToReconcile = Effect.fn("Stores.toReconcile")(function*() {
  const db = yield* Db
  return yield* db.routing((sql) => sql<ToReconcile>`select workspace_id, store_id from stores_to_reconcile()`)
})

/** One run over `stores`, in their order, until its budget is spent. Never fails. Answers how many it swept. */
export const sweepStores = (stores: ReadonlyArray<ToReconcile>) =>
  Effect.gen(function*() {
    const started = Date.now()
    let gapPages = GAP_PAGES_PER_SWEEP
    let swept = 0
    for (const { workspaceId, storeId } of stores) {
      if (Date.now() - started > SWEEP_BUDGET_MS) break
      swept++
      gapPages -= yield* sweepStore(storeId, gapPages).pipe(
        Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
      )
    }
    yield* Effect.annotateCurrentSpan({ stores: stores.length, swept, gapPagesLeft: gapPages })
    return swept
  })

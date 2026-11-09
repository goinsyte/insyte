import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { Config, Effect, Schema } from "effect"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { addLine, CUSTOMERS_QUERY, emptyBatch, ordersQuery, PRODUCTS_QUERY } from "../domain/Mirror.ts"
import { type BulkStatus, ConnectionGate, ShopifyGraphql } from "../domain/Ports.ts"
import { applyBatch } from "./mirror.ts"

/*
 * A store's backfill (M6.3; integrations.md §2 "Backfill"), as the steps `ShopifyBackfillWorkflow` makes durable: one
 * bulk operation per resource (products first, so lines find their variants; customers before orders, so an order
 * finds its customer), polled until Shopify has the file, then read in pages from a byte offset, each page written
 * and checkpointed by the Workflow. Every step is safe to run again: the upserts are idempotent, and the counts are
 * read from the mirror, not added up. Each runs inside the store's workspace (`CurrentWorkspace`).
 */

export const RESOURCES = ["products", "customers", "orders"] as const
export type Resource = (typeof RESOURCES)[number]
export const Resource = Schema.Literals(RESOURCES)

/** What every step needs, read once at the start. */
export interface BackfillContext {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly currency: string
  /** Orders created on or after this day (ISO date). */
  readonly since: string
  /** When the import began: the reconcile sweep reads what changed from here (bulk files are a snapshot). */
  readonly startedAt: string
}

/** The mirror's counts for a store, as the sync step and the dialog show them. */
export interface MirrorCounts {
  readonly products: number
  readonly customers: number
  readonly orders: number
}

/** Two years back: `read_all_orders`' default reach; without it Shopify answers 60 days whatever is asked. */
const HISTORY_DAYS = 730

const queryOf = (resource: Resource, since: string) =>
  resource === "products" ? PRODUCTS_QUERY : resource === "customers" ? CUSTOMERS_QUERY : ordersQuery(since)

/**
 * The store is importing: `connecting` until the backfill finishes, and every resource's checkpoint cleared. `null`
 * for a store disconnected (or needing the operator) before its import began: there is nothing to import.
 */
export const prepare = Effect.fn("Stores.backfill.prepare")(function*(storeId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [store] = yield* sql<{ connectionId: string; shop: string; currency: string | null }>`
        update stores set status = 'connecting' where id = ${storeId} and status in ('connected', 'connecting')
        returning connection_id, shop_domain as shop, currency`
      if (store === undefined) return null
      for (const resource of RESOURCES) {
        yield* sql`insert into sync_cursors (connection_id, workspace_id, resource, backfill_state)
                   values (${store.connectionId}, app_workspace_id(), ${resource}, '{"phase":"queued"}')
                   on conflict (connection_id, resource) do update set backfill_state = excluded.backfill_state`
      }
      const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
      return {
        storeId,
        connectionId: store.connectionId,
        shop: store.shop,
        currency: store.currency ?? "EUR",
        since,
        startedAt: new Date().toISOString()
      } satisfies BackfillContext as BackfillContext | null
    })
  )
})

const checkpoint = Effect.fn("Stores.backfill.checkpoint")(
  function*(ctx: BackfillContext, resource: Resource, state: Record<string, unknown>) {
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update sync_cursors set backfill_state = ${JSON.stringify(state)}::jsonb
          where connection_id = ${ctx.connectionId} and resource = ${resource}`
    )
  }
)

/** One call through the gate: a token, the bucket's go-ahead, and what Shopify said the bucket holds now. */
export const throughGate = <A extends { readonly throttle: unknown }, E, R>(
  ctx: Pick<BackfillContext, "connectionId">,
  cost: number,
  call: (token: Parameters<ShopifyGraphql["Service"]["start"]>[1]) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function*() {
    const gate = yield* ConnectionGate
    const token = yield* gate.accessToken(ctx.connectionId)
    yield* gate.reserve(ctx.connectionId, cost)
    const result = yield* call(token)
    const throttle = result.throttle as Parameters<ConnectionGate["Service"]["observe"]>[1] | null
    if (throttle !== null) yield* gate.observe(ctx.connectionId, throttle)
    return result
  })

/** Asks Shopify to run the resource's bulk query; answers its operation id. */
export const startBulk = Effect.fn("Stores.backfill.start")(function*(ctx: BackfillContext, resource: Resource) {
  const bulk = yield* ShopifyGraphql
  const { id } = yield* throughGate(ctx, 10, (token) => bulk.start(ctx.shop, token, queryOf(resource, ctx.since)))
  yield* checkpoint(ctx, resource, { phase: "running", bulkId: id })
  return id
})

/** Where the operation is. A failed or expired one fails the step: the Workflow starts the resource again. */
export const pollBulk = Effect.fn("Stores.backfill.poll")(
  function*(ctx: BackfillContext, resource: Resource, bulkId: string) {
    const bulk = yield* ShopifyGraphql
    const status = yield* throughGate(ctx, 1, (token) => bulk.status(ctx.shop, token, bulkId))
    if (status.status === "FAILED" || status.status === "CANCELED" || status.status === "EXPIRED") {
      return yield* Effect.die(new Error(`bulk ${resource} ${status.status}: ${status.errorCode ?? "no code"}`))
    }
    return { status: status.status, url: status.url, objectCount: status.objectCount } satisfies Omit<
      BulkStatus,
      "errorCode"
    >
  }
)

/** The store's mirror as it is now. */
export const countsOf = Effect.fn("Stores.backfill.counts")(function*(storeId: string) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ products: number; customers: number; orders: number }>`
      select (select count(*) from products where store_id = ${storeId})::int as products,
             (select count(*) from customers where store_id = ${storeId})::int as customers,
             (select count(*) from orders where store_id = ${storeId})::int as orders`
  )
  return {
    products: row?.products ?? 0,
    customers: row?.customers ?? 0,
    orders: row?.orders ?? 0
  } satisfies MirrorCounts
})

/** Reads and writes one page from `offset`; answers where the next starts, and the mirror's counts. */
export const applyPage = Effect.fn("Stores.backfill.page")(
  function*(ctx: BackfillContext, resource: Resource, url: string | null, offset: number) {
    const lines = yield* Config.Int("SYNC_PAGE_LINES").pipe(Config.withDefault(2000))
    const bulk = yield* ShopifyGraphql
    const page = url === null ? { lines: [], next: offset, done: true } : yield* bulk.read(url, offset, lines).pipe(
      Effect.orDie
    )
    const batch = emptyBatch()
    for (const line of page.lines) addLine(batch, line, ctx.currency)
    const written = yield* applyBatch(ctx.storeId, batch, { live: false })
    yield* checkpoint(ctx, resource, page.done ? { phase: "done" } : { phase: "reading", offset: page.next })
    const counts = yield* countsOf(ctx.storeId)
    return { next: page.next, done: page.done, orphans: written.orphans, counts }
  }
)

/** The first import is in: the store is connected and synced, and the workspace hears it. */
export const finish = Effect.fn("Stores.backfill.finish")(function*(ctx: BackfillContext) {
  const db = yield* Db
  const outboxIds = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update stores set status = 'connected', last_synced_at = now()
                 where id = ${ctx.storeId} and status = 'connecting'`
      yield* sql`update connections set last_synced_at = now() where id = ${ctx.connectionId}`
      yield* sql`update sync_cursors set watermark_at = ${ctx.startedAt}::timestamptz
                 where connection_id = ${ctx.connectionId}`
      const [workspace] = yield* sql<{ id: string }>`select app_workspace_id() as id`
      const workspaceId = workspace!.id
      return [
        yield* Outbox.write(sql, workspaceId, { type: "store.synced", workspaceId, storeId: ctx.storeId }),
        yield* Outbox.write(sql, workspaceId, {
          type: "records.changed",
          workspaceId,
          kind: "store",
          ids: [ctx.storeId]
        })
      ]
    })
  )
  return { outboxIds, counts: yield* countsOf(ctx.storeId) }
})

/**
 * The backfill gave up (its retries are spent, or the token was refused): the store needs the operator, and the
 * connection's health says why (M6.1's incidents).
 */
export const giveUp = Effect.fn("Stores.backfill.giveUp")(function*(ctx: BackfillContext, reason: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update stores set status = 'action_required' where id = ${ctx.storeId} and status = 'connecting'`
      yield* sql`insert into connection_incidents (id, workspace_id, connection_id, kind, tried)
                 values (${mintId("inc")}, app_workspace_id(), ${ctx.connectionId}, 'sync_failed',
                         ${JSON.stringify([{ step: "backfill", reason: reason.slice(0, 300) }])}::jsonb)
                 on conflict (connection_id, kind) where resolved_at is null do update set tried = excluded.tried`
    })
  )
})

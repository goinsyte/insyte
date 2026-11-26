import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { Config, Effect, Schema } from "effect"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { throughGate } from "../domain/Gate.ts"
import type { IncidentFacts } from "../domain/Health.ts"
import {
  addLine,
  backfillQuery,
  type BackfillResource,
  backfillRoot,
  backfillVariables,
  emptyBatch,
  FOLLOW_UP_PAGE,
  type PageSizes
} from "../domain/Mirror.ts"
import {
  missingScope,
  refusalMessage,
  ShopifyGraphql,
  type ShopifyRefused,
  type TokenRefused
} from "../domain/Ports.ts"
import { applyBatch, settleStock } from "./mirror.ts"
import { connectionAt, wholeNode } from "./reads.ts"

/*
 * A store's backfill (M6.3; integrations.md §2 "Backfill"), as the steps `ShopifyBackfillWorkflow` makes durable: per
 * resource, plain Admin GraphQL pages by id (`backfillQuery`), each written and its cursor checkpointed before the next
 * is read. A node with more children than its page carries (a product's variants or photographs, an item's locations,
 * an order's lines) has the rest read right after it, a hundred at a time, and written in the same batch: a page's
 * nodes are whole. No bulk operations: Shopify now asks an IP allowlist for those, and a Worker has no fixed address.
 *
 * A step reads pages until its time or its pages are spent (`readPages`), so a large store is a few hundred steps, not
 * one per page. Every step is safe to run again: it starts from the checkpoint, the upserts are idempotent, and the
 * counts are read from the mirror, not added up. Shopify's throttle is waited out inside the step when the wait is
 * short, and handed to the Workflow to sleep on when not, so it never spends a step's retries. Each runs inside the
 * store's workspace (`CurrentWorkspace`).
 */

/**
 * The stock is a pass of its own after the products (each count finds its variant by its inventory item). Its
 * checkpoint is a `sync_cursors` row like the others, which the sync status leaves out (there the stock is part of
 * the products).
 */
export const RESOURCES = ["products", "stock", "customers", "orders"] as const satisfies ReadonlyArray<BackfillResource>
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
  /** When the import began: the reconcile sweep reads what changed from here (the pages are read over time). */
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

/** What the gate holds back for a page: about what one costs Shopify once read (its requested cost is higher). */
const PAGE_COST = 50

/** How long a step reads pages for, and the most it reads; the Workflow's step timeout is well past both. */
const STEP_BUDGET_MS = 30_000
const STEP_PAGES = 50

/** A throttle up to this long is waited out in the step; a longer one ends the step, and the Workflow sleeps on it. */
const WAIT_IN_STEP_MS = 5_000
/** Never asked again sooner than this, whatever the answer said (a `Retry-After: 0`). */
const MIN_WAIT_MS = 500

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

/** Where a resource's import is: not begun, reading from `cursor` (Shopify's, opaque), or done. */
type Checkpoint =
  | { readonly phase: "queued" }
  | { readonly phase: "reading"; readonly cursor: string }
  | { readonly phase: "done" }

const checkpointOf = Effect.fn("Stores.backfill.checkpointOf")(function*(ctx: BackfillContext, resource: Resource) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ state: { phase?: string; cursor?: unknown } | null }>`
      select backfill_state as state from sync_cursors
      where connection_id = ${ctx.connectionId} and resource = ${resource}`
  )
  const state = row?.state
  if (state?.phase === "done") return { phase: "done" } satisfies Checkpoint as Checkpoint
  if (state?.phase === "reading" && typeof state.cursor === "string") {
    return { phase: "reading", cursor: state.cursor } satisfies Checkpoint as Checkpoint
  }
  return { phase: "queued" } satisfies Checkpoint as Checkpoint
})

const checkpoint = Effect.fn("Stores.backfill.checkpoint")(
  function*(ctx: BackfillContext, resource: Resource, state: Checkpoint) {
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update sync_cursors set backfill_state = ${JSON.stringify(state)}::jsonb
          where connection_id = ${ctx.connectionId} and resource = ${resource}`
    )
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

/** Smaller pages for the worker tests (`SYNC_PAGE_SIZE`, `SYNC_CHILD_PAGE`, `SYNC_STEP_PAGES`); `0` is the default. */
const settings = Effect.gen(function*() {
  const page = yield* Config.Int("SYNC_PAGE_SIZE").pipe(Config.withDefault(0))
  const child = yield* Config.Int("SYNC_CHILD_PAGE").pipe(Config.withDefault(0))
  const steps = yield* Config.Int("SYNC_STEP_PAGES").pipe(Config.withDefault(0))
  return { sizes: { page, child } satisfies PageSizes, stepPages: steps || STEP_PAGES }
}).pipe(Effect.orDie)

/**
 * One page from `cursor`, as lines: each node, then all of its children, those past the page's first read after it
 * (`wholeNode`). Answers where the next page starts (`null`: this was the last).
 */
const fetchPage = Effect.fn("Stores.backfill.fetch")(
  function*(ctx: BackfillContext, resource: Resource, cursor: string | null, sizes: PageSizes) {
    const graphql = yield* ShopifyGraphql
    const ask = (query: string, variables: Record<string, unknown>) =>
      throughGate(ctx, PAGE_COST, (token) => graphql.query(ctx.shop, token, query, variables))
    const root = backfillRoot(resource)
    const { data } = yield* ask(backfillQuery(resource, sizes), backfillVariables(resource, ctx.since, cursor))
    const page = connectionAt(data, [root])
    if (page === undefined) return yield* Effect.die(new Error(`backfill ${resource}: Shopify answered no ${root}`))
    const lines: Array<unknown> = []
    for (const { node } of page.edges) lines.push(...yield* wholeNode(node, ask, sizes.child || FOLLOW_UP_PAGE))
    const next = page.pageInfo?.hasNextPage === true ? page.pageInfo.endCursor : null
    return { lines, next }
  }
)

/**
 * Reads and writes pages of `resource` from its checkpoint until the step's time or pages are spent, each one
 * checkpointed. Answers whether the resource is done, how long Shopify asked to wait (`0`: not throttled), and the
 * mirror's counts. A refusal no retry changes (`refusalOf`) gives the import up here, in the step, so the step
 * succeeds with `refused` and the Workflow stops; any other failure fails the step, which is retried.
 */
export const readPages = Effect.fn("Stores.backfill.pages")(function*(ctx: BackfillContext, resource: Resource) {
  const { sizes, stepPages } = yield* settings
  const began = Date.now()
  let state = yield* checkpointOf(ctx, resource)
  let read = 0
  let waitMs = 0
  while (state.phase !== "done" && read < stepPages && Date.now() - began < STEP_BUDGET_MS) {
    const cursor = state.phase === "reading" ? state.cursor : null
    const stop = <E extends ShopifyRefused | TokenRefused>(error: E) => {
      const refused = refusalOf(error)
      return refused === null ? Effect.fail(error) : Effect.succeed({ page: null, throttled: 0, refused })
    }
    const fetched = yield* fetchPage(ctx, resource, cursor, sizes).pipe(
      Effect.map((page) => ({ page, throttled: 0, refused: null })),
      Effect.catchTags({
        ShopifyThrottled: (throttled) =>
          Effect.succeed({ page: null, throttled: Math.max(MIN_WAIT_MS, throttled.retryAfterMs), refused: null }),
        ShopifyRefused: stop,
        TokenRefused: stop
      })
    )
    if (fetched.refused !== null) {
      yield* giveUp(ctx, fetched.refused.reason, fetched.refused.facts)
      const counts = yield* countsOf(ctx.storeId)
      return { done: false, waitMs: 0, pages: read, counts, refused: fetched.refused.reason as string | null }
    }
    if (fetched.page === null) {
      // A short wait is had here; a long one, or one past the step's time, is the Workflow's to sleep on.
      if (fetched.throttled <= WAIT_IN_STEP_MS && Date.now() - began + fetched.throttled < STEP_BUDGET_MS) {
        yield* Effect.sleep(fetched.throttled)
        continue
      }
      waitMs = fetched.throttled
      break
    }
    const batch = emptyBatch()
    for (const line of fetched.page.lines) addLine(batch, line, ctx.currency)
    yield* applyBatch(ctx.storeId, batch, { live: false })
    read++
    const next = fetched.page.next
    // The last page of the stock: every count Shopify holds is in, so what it no longer holds goes.
    if (resource === "stock" && next === null) yield* settleStock(ctx.storeId, ctx.startedAt)
    state = next === null ? { phase: "done" } : { phase: "reading", cursor: next }
    yield* checkpoint(ctx, resource, state)
  }
  return {
    done: state.phase === "done",
    waitMs,
    pages: read,
    counts: yield* countsOf(ctx.storeId),
    refused: null as string | null
  }
})

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
 * A refusal no retry changes, as the incident's facts: Shopify no longer accepts the token (401, or a refresh it
 * refused), or it denies the call (403: a grant the store has not approved, or data the app is not approved for, such
 * as protected customer data). `null` for anything a retry may mend (a 5xx, a timeout) and for a store disconnected
 * while it imported.
 */
export const refusalOf = (
  error: ShopifyRefused | TokenRefused
): { readonly reason: string; readonly facts: IncidentFacts } | null => {
  if (error._tag === "TokenRefused") {
    return error.reason === "expired" ? { reason: "the store's token was refused", facts: { refused: "token" } } : null
  }
  if (error.status === 401) return { reason: refusalMessage(error), facts: { refused: "token" } }
  if (error.status !== 403) return null
  const scope = missingScope(error)
  return {
    reason: refusalMessage(error),
    facts: scope === undefined ? { refused: "data" } : { refused: "scope", missing: [scope] }
  }
}

/**
 * The backfill gave up (its retries are spent, or Shopify refused it): the store needs the operator, and the
 * connection's health says why (M6.1's incidents). A refusal (`facts.refused`) is noted as one: no retry was made.
 */
export const giveUp = Effect.fn("Stores.backfill.giveUp")(
  function*(ctx: BackfillContext, reason: string, facts: IncidentFacts = {}) {
    const db = yield* Db
    const tried = [{
      step: "backfill",
      outcome: facts.refused === undefined ? "failed" : "refused",
      reason: reason.slice(0, 300)
    }]
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`update stores set status = 'action_required' where id = ${ctx.storeId} and status = 'connecting'`
        yield* sql`insert into connection_incidents (id, workspace_id, connection_id, kind, facts, tried)
                   values (${mintId("inc")}, app_workspace_id(), ${ctx.connectionId}, 'sync_failed',
                           ${JSON.stringify(facts)}::jsonb, ${JSON.stringify(tried)}::jsonb)
                   on conflict (connection_id, kind) where resolved_at is null
                   do update set facts = excluded.facts, tried = excluded.tried`
      })
    )
  }
)

import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { throughGate } from "../../stores/domain/Gate.ts"
import { ShopifyGraphql } from "../../stores/domain/Ports.ts"
import {
  AnalysisNotReady,
  type DeliveryPromise,
  FirstAnalysisView,
  type PrepareInput,
  type Read,
  SetupFacts
} from "../domain/FirstAnalysis.ts"
import { Analyses } from "../domain/Ports.ts"
import { historyOf, predictionsOf, promisesIn, READS, titlesOf, watchOf } from "../domain/Rules.ts"

/*
 * The first analysis (M6.5). `start` makes the store's one analysis (after its first import) and starts the Workflow
 * that reads it; starting again only makes sure that Workflow runs. The Workflow's steps read the mirror (orders,
 * then product pages), then Shopify (countries and policies), then work out the early read; every step ticks its read
 * off. A Shopify read that fails (a missing scope, a store without credentials) is said as unreadable, never guessed.
 * `prepare` keeps the operator's answers and what they chose to have ready.
 */

/** What every Workflow step needs, read once at the start. */
export interface AnalysisContext {
  readonly analysisId: string
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
}

interface Row {
  readonly id: string
  readonly storeId: string
  readonly state: "reading" | "early" | "failed"
  readonly reads: ReadonlyArray<Read>
  readonly setup: unknown
  readonly predictions: FirstAnalysisView["predictions"]
  readonly watch: FirstAnalysisView["watch"]
  readonly titles: Partial<FirstAnalysisView["prepared"]>
  readonly answers: Record<string, string> | null
  readonly prepared: ReadonlyArray<"automation" | "agent" | "sheet">
  readonly preparedAt: Date | null
}

const decodeFacts = Schema.decodeUnknownOption(SetupFacts)

/** The workspace's imported store, the one the analysis reads. */
const storeOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string }>`select id from stores where status <> 'disconnected' and last_synced_at is not null
                        order by created_at desc limit 1`,
    (rows) => rows[0]?.id
  )

const mirrorCounts = (sql: SqlClient.SqlClient, storeId: string) =>
  Effect.map(
    sql<{ products: number; customers: number; orders: number; days: number }>`
      select (select count(*) from products where store_id = ${storeId})::int as products,
             (select count(*) from customers where store_id = ${storeId})::int as customers,
             (select count(*) from orders where store_id = ${storeId})::int as orders,
             coalesce((select floor(extract(epoch from now() - min(placed_at)) / 86400) from orders
                       where store_id = ${storeId}), 0)::int as days`,
    (rows) => rows[0] ?? { products: 0, customers: 0, orders: 0, days: 0 }
  )

const NO_TITLES = titlesOf({
  shipsTo: null,
  policies: null,
  promises: [],
  gateways: [],
  orders: 0,
  products: 0,
  customers: 0,
  days: 0,
  delivered: 0,
  refundReasons: 0
})

const viewOf = (row: Row | undefined, store: { products: number; customers: number; orders: number; days: number }) =>
  new FirstAnalysisView({
    state: row?.state ?? "none",
    store,
    history: historyOf(store),
    reads: row?.reads ?? READS,
    predictions: row?.predictions ?? [],
    watch: row?.watch ?? [],
    prepared: { ...NO_TITLES, ...row?.titles },
    chosen: row?.preparedAt === null || row?.preparedAt === undefined
      ? null
      : { ids: row.prepared, answers: row.answers ?? {} }
  })

const SELECT = `fa.id, fa.store_id, fa.state, fa.reads, fa.setup, fa.predictions, fa.watch, fa.titles, fa.answers,
  fa.prepared, fa.prepared_at`

/** The step's view: the workspace's analysis as it stands, or `none` before it began. */
export const get = Effect.fn("FirstAnalysis.get")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const storeId = yield* storeOf(sql)
      if (storeId === undefined) return viewOf(undefined, { products: 0, customers: 0, orders: 0, days: 0 })
      const [row] = yield* sql<Row>`select ${sql.literal(SELECT)} from first_analyses fa where fa.store_id = ${storeId}`
      return viewOf(row, yield* mirrorCounts(sql, storeId))
    })
  )
})

/** Makes the store's analysis if it has none, and makes sure its reading runs; answers the view. */
export const start = Effect.fn("FirstAnalysis.start")(function*() {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const reading = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const storeId = yield* storeOf(sql)
      if (storeId === undefined) return undefined
      yield* sql`insert into first_analyses (id, workspace_id, store_id, reads)
                 values (${mintId("fan")}, app_workspace_id(), ${storeId}, ${JSON.stringify(READS)}::jsonb)
                 on conflict (store_id) do nothing`
      const [row] = yield* sql<{ id: string; state: string }>`
        select id, state from first_analyses where store_id = ${storeId}`
      return row?.state === "reading" ? { id: row.id, storeId } : undefined
    })
  )
  // Named by the analysis: asking twice finds the one already reading.
  if (reading !== undefined) {
    const analyses = yield* Analyses
    yield* analyses.start({ key: reading.id, workspaceId: principal.workspaceId, storeId: reading.storeId })
  }
  return yield* get()
})

/** The operator's answers and the items to have ready; refused while the analysis still reads. */
export const prepare = Effect.fn("FirstAnalysis.prepare")(function*(input: PrepareInput) {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const saved = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const storeId = yield* storeOf(sql)
      if (storeId === undefined) return []
      return yield* sql`
        update first_analyses set answers = ${JSON.stringify(input.answers)}::jsonb, prepared = ${[
        ...input.ids
      ]}::text[],
                                  prepared_at = now()
        where store_id = ${storeId} and state <> 'reading' returning id`
    })
  )
  if (saved.length === 0) return yield* new AnalysisNotReady()
  return yield* get()
})

/* ─── the Workflow's steps ─────────────────────────────────────────────── */

/** The analysis and its store, or `null` when either is gone (disconnected since): nothing to read. */
export const begin = Effect.fn("FirstAnalysis.begin")(function*(analysisId: string) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ storeId: string; connectionId: string; shop: string }>`
      select fa.store_id, s.connection_id, s.shop_domain as shop from first_analyses fa
      join stores s on s.id = fa.store_id where fa.id = ${analysisId} and s.status <> 'disconnected'`
  )
  return row === undefined ? null : ({ analysisId, ...row } satisfies AnalysisContext as AnalysisContext | null)
})

/** Merges facts into the setup and ticks a read off, in one statement. */
const record = Effect.fn("FirstAnalysis.record")(
  function*(ctx: AnalysisContext, read: Read["id"], facts: Record<string, unknown>) {
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update first_analyses
          set setup = coalesce(setup, '{}'::jsonb) || ${JSON.stringify(facts)}::jsonb,
              reads = (select jsonb_agg(case when r->>'id' = ${read} then r || '{"done":true}'::jsonb else r end)
                       from jsonb_array_elements(reads) r)
          where id = ${ctx.analysisId}`
    )
  }
)

/** Orders and parcels: how much history there is, how it was paid, what was delivered and refunded with a reason. */
export const readOrders = Effect.fn("FirstAnalysis.readOrders")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  const facts = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const counts = yield* mirrorCounts(sql, ctx.storeId)
      const [more] = yield* sql<{ delivered: number; refundReasons: number; gateways: Array<string> | null }>`
        select (select count(*) from fulfilments f join orders o on o.id = f.order_id
                where o.store_id = ${ctx.storeId} and f.delivered_at is not null)::int as delivered,
               (select count(*) from refunds r join orders o on o.id = r.order_id
                where o.store_id = ${ctx.storeId} and coalesce(r.note, '') <> '')::int as refund_reasons,
               (select array_agg(distinct payment_gateway) from orders
                where store_id = ${ctx.storeId} and payment_gateway is not null) as gateways`
      return {
        ...counts,
        delivered: more?.delivered ?? 0,
        refundReasons: more?.refundReasons ?? 0,
        gateways: more?.gateways ?? []
      }
    })
  )
  yield* record(ctx, "orders", facts)
})

/** How many product pages Insyte reads for the delivery times they promise: the most recently changed. */
const PAGES = 500

/** Product pages: the delivery times they promise. */
export const readProducts = Effect.fn("FirstAnalysis.readProducts")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  const pages = yield* db.scopedFor((sql) =>
    sql<{ descriptionHtml: string }>`
      select description_html from products where store_id = ${ctx.storeId} and status = 'active'
      order by external_updated_at desc limit ${PAGES}`
  )
  const promises: Array<DeliveryPromise> = pages.flatMap((p) => promisesIn(p.descriptionHtml, "product"))
  yield* record(ctx, "products", { promises })
})

const SHIPS_TO = "query { shop { shipsToCountries } }"
const POLICIES = "query { shop { shopPolicies { type body } } }"

/** One shop read through the store's gate; `null` when Shopify, the token or the scope says no. */
const shopRead = <A>(ctx: AnalysisContext, query: string, pick: (data: unknown) => A) =>
  Effect.gen(function*() {
    const graphql = yield* ShopifyGraphql
    const answer = yield* throughGate(ctx, 1, (token) => graphql.query(ctx.shop, token, query, {}))
    return pick(answer.data)
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.as(Effect.logInfo("first analysis: a shop read was refused", { query, cause }), null)
    )
  )

const ShopData = Schema.Struct({
  shop: Schema.Struct({
    shipsToCountries: Schema.optional(Schema.Array(Schema.String)),
    shopPolicies: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.String, body: Schema.String })))
  })
})
const decodeShop = Schema.decodeUnknownSync(ShopData)

/** Shopify: the countries the store ships to, and its shipping and refund policies (with what the first promises). */
export const readPolicies = Effect.fn("FirstAnalysis.readPolicies")(function*(ctx: AnalysisContext) {
  const shipsTo = yield* shopRead(ctx, SHIPS_TO, (data) => decodeShop(data).shop.shipsToCountries ?? null)
  const policies = yield* shopRead(ctx, POLICIES, (data) => {
    const all = decodeShop(data).shop.shopPolicies ?? []
    const body = (type: string) => all.find((p) => p.type === type)?.body ?? null
    return { shipping: body("SHIPPING_POLICY"), refund: body("REFUND_POLICY") }
  })
  const db = yield* Db
  const [current] = yield* db.scopedFor((sql) =>
    sql<{ promises: Array<DeliveryPromise> | null }>`
      select setup->'promises' as promises from first_analyses where id = ${ctx.analysisId}`
  )
  const fromPolicy = policies?.shipping === null || policies === null ? [] : promisesIn(policies.shipping, "policy")
  yield* record(ctx, "policies", { shipsTo, policies, promises: [...(current?.promises ?? []), ...fromPolicy] })
})

/** Works the early read out of the facts read, and says the analysis is done. */
export const finish = Effect.fn("FirstAnalysis.finish")(function*(ctx: AnalysisContext) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ setup: unknown }>`select setup from first_analyses where id = ${ctx.analysisId}`
      const facts = decodeFacts(row?.setup)
      if (facts._tag === "None") return yield* Effect.die(new Error("first analysis: the setup facts are incomplete"))
      yield* sql`update first_analyses
                 set state = 'early', finished_at = now(),
                     predictions = ${JSON.stringify(predictionsOf(facts.value))}::jsonb,
                     watch = ${JSON.stringify(watchOf(facts.value))}::jsonb,
                     titles = ${JSON.stringify(titlesOf(facts.value))}::jsonb
                 where id = ${ctx.analysisId}`
    })
  )
})

/** The reading gave up (its retries are spent): the step says so instead of reading forever. */
export const fail = Effect.fn("FirstAnalysis.fail")(function*(analysisId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update first_analyses set state = 'failed', finished_at = now() where id = ${analysisId} and state = 'reading'`
  )
})

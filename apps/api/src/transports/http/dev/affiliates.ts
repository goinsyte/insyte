import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type * as CloseModule from "@insyte/modules/affiliates/use-cases/close"
import * as Outbox from "@insyte/modules/shared/use-cases/Outbox"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly } from "./shared.ts"

/*
 * The affiliate programme's clock and its orders, for the worker tests and a preview (M16 steps 4–5); refused outside
 * them. The recorded Shopify twin has no order with a code or a link, and no test waits a month:
 * - `POST /api/__dev/affiliates/order?workspace&number&code&ref&email&customer&shipped&cancelled&refund&placed`: the
 *   order `number` as if Shopify had told of it with that discount code or cart attribute `insyte_ref`, that buyer's
 *   address and Shopify customer id, shipped, cancelled or
 *   refunded at those times (ISO; the refund in minor units); a number the store does not have is a copy of its
 *   \`#1001\` (the recorded twin has two orders); `placed` (`1` for now, or ISO) places it then and writes
 *   its `order.placed` (the relay attributes it), a cancel its `order.cancelled`, anything else its `order.fulfilled`.
 *   Answers the outbox ids.
 * - `POST /api/__dev/affiliates/tiers?workspace&silver&gold`: the tiers' thresholds (a test does not sell 100 orders).
 * - `POST /api/__dev/affiliates/settle?workspace&at`: the daily approval (and its purge of what is past keeping) as if
 *   it were `at`.
 * - `POST /api/__dev/affiliates/close?workspace&month&at`: the month's close as `MonthlyCloseWorkflow`'s step runs it.
 */

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

const params = Effect.map(HttpServerRequest.HttpServerRequest, (r) => new URL(r.url, "http://local").searchParams)

const inWorkspace = <A, E, R>(q: URLSearchParams, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentWorkspace, { id: (q.get("workspace") ?? "") as WorkspaceId }))

const dateOf = (value: string | null) => (value === null || value === "" ? null : new Date(value))
const placedAt = (value: string | null) => (value === "1" ? new Date() : dateOf(value))

let closing: Promise<typeof CloseModule> | undefined
const close = Effect.promise(() => closing ??= import("@insyte/modules/affiliates/use-cases/close"))

const AffiliateOrder = HttpRouter.add(
  "POST",
  "/api/__dev/affiliates/order",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const q = yield* params
    const db = yield* Db
    const outboxIds = yield* inWorkspace(
      q,
      db.scopedFor((sql) =>
        Effect.gen(function*() {
          const number = q.get("number") ?? ""
          const copy = mintId("ord")
          yield* sql`
            insert into orders
            select (jsonb_populate_record(null::orders, to_jsonb(o) || jsonb_build_object(
                      'id', ${copy}::text, 'shopify_id', ${`dev-${copy}`}::text, 'number', ${number}::text))).*
            from orders o
            where o.number = '#1001'
              and not exists (select 1 from orders x where x.number = ${number})
            limit 1`
          const [order] = yield* sql<{ id: string; storeId: string; currency: string; workspaceId: string }>`
            update orders set
              referral_code = coalesce(${q.get("code")}, referral_code),
              affiliate_ref = coalesce(${q.get("ref")}, affiliate_ref),
              customer_email = coalesce(${q.get("email")}, customer_email),
              customer_shopify_id = coalesce(${q.get("customer")}, customer_shopify_id),
              shipped_at = coalesce(${dateOf(q.get("shipped"))}, shipped_at),
              cancelled_at = coalesce(${dateOf(q.get("cancelled"))}, cancelled_at),
              placed_at = coalesce(${placedAt(q.get("placed"))}, placed_at)
            where number = ${number}
            returning id, store_id, currency, workspace_id`
          if (order === undefined) return []
          const refund = Number(q.get("refund") ?? 0)
          if (refund > 0) {
            yield* sql`insert into refunds (id, workspace_id, store_id, order_id, shopify_id, amount_minor, currency,
                                            created_at)
                       values (${mintId("ref")}, ${order.workspaceId}, ${order.storeId}, ${order.id},
                               ${`dev-${Date.now()}`}, ${refund}, ${order.currency},
                               ${dateOf(q.get("refunded")) ?? new Date()})`
          }
          const event = q.get("placed") !== null
            ? { type: "order.placed" as const, workspaceId: order.workspaceId, orderIds: [order.id] }
            : q.get("cancelled") !== null
            ? { type: "order.cancelled" as const, workspaceId: order.workspaceId, orderIds: [order.id] }
            : { type: "order.fulfilled" as const, workspaceId: order.workspaceId, orderIds: [order.id] }
          return [yield* Outbox.write(sql, order.workspaceId, event as never)]
        })
      )
    )
    return HttpServerResponse.jsonUnsafe({ outboxIds })
  }).pipe(Effect.orDie, withRequestDb)
)

const AffiliateSettle = HttpRouter.add(
  "POST",
  "/api/__dev/affiliates/settle",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const q = yield* params
    const outcome = yield* inWorkspace(
      q,
      Effect.flatMap(close, (m) => m.settleWorkspace(dateOf(q.get("at")) ?? new Date()))
    )
    return HttpServerResponse.jsonUnsafe(outcome)
  }).pipe(Effect.orDie, withRequestDb)
)

const AffiliateClose = HttpRouter.add(
  "POST",
  "/api/__dev/affiliates/close",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const q = yield* params
    const outcome = yield* inWorkspace(
      q,
      Effect.flatMap(close, (m) => m.closeWorkspace(q.get("month") ?? "", dateOf(q.get("at")) ?? new Date()))
    )
    return HttpServerResponse.jsonUnsafe(outcome)
  }).pipe(Effect.orDie, withRequestDb)
)

const AffiliateTiers = HttpRouter.add(
  "POST",
  "/api/__dev/affiliates/tiers",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const q = yield* params
    const db = yield* Db
    yield* inWorkspace(
      q,
      db.scopedFor((sql) =>
        Effect.gen(function*() {
          for (const tier of ["silver", "gold"]) {
            const threshold = q.get(tier)
            if (threshold !== null) {
              yield* sql`update affiliate_tiers set threshold = ${Number(threshold)} where tier = ${tier}`
            }
          }
        })
      )
    )
    return HttpServerResponse.jsonUnsafe({ ok: true })
  }).pipe(Effect.orDie, withRequestDb)
)

export const AffiliateRoutes = Layer.mergeAll(AffiliateOrder, AffiliateSettle, AffiliateClose, AffiliateTiers)

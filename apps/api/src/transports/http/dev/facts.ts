import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { drainWorkspace, markRecentWorkspace, rebuildWorkspace } from "@insyte/modules/facts/Facts"
import { emptyBatch, type MirrorBatch } from "@insyte/modules/stores/domain/Mirror"
import { applyBatch } from "@insyte/modules/stores/use-cases/mirror"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

const storeParam = Effect.map(
  HttpServerRequest.HttpServerRequest,
  (request) => new URL(request.url, "http://local").searchParams.get("store") ?? ""
)

/**
 * `POST /api/__dev/facts/orders?workspace=<id>&store=<id>`: rows for the facts' worker tests (M10.4), written through
 * the Shopify mirror's own writer, so the triggers see what a sync would write: orders, lines, parcels and refunds as a
 * mirror page holds them, the store's timezone first if given, and after them the fields only Insyte sets (`delayed`,
 * `promised`, by Shopify id). Refused in production.
 */
const FactsOrders = HttpRouter.add(
  "POST",
  "/api/__dev/facts/orders",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const storeId = yield* storeParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json) as {
      readonly timezone?: string
      readonly batch?: Partial<Pick<MirrorBatch, "orders" | "lines" | "fulfilments" | "refunds">>
      readonly delayed?: ReadonlyArray<string>
      readonly promised?: Record<string, string>
    }
    const db = yield* Db
    const timezone = body.timezone
    if (timezone !== undefined) {
      yield* db.scopedFor((sql) => sql`update stores set timezone = ${timezone} where id = ${storeId}`).pipe(
        Effect.provideService(CurrentWorkspace, workspace)
      )
    }
    const written = yield* applyBatch(storeId, { ...emptyBatch(), ...body.batch }, { live: false }).pipe(
      Effect.provideService(CurrentWorkspace, workspace)
    )
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        for (const id of body.delayed ?? []) {
          yield* sql`update orders set delayed_at = now() where store_id = ${storeId} and shopify_id = ${id}`
        }
        for (const [id, at] of Object.entries(body.promised ?? {})) {
          yield* sql`update orders set promised_by = ${at}::timestamptz
                     where store_id = ${storeId} and shopify_id = ${id}`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ written })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/facts?workspace=<id>`: the workspace's fact rows as stored, every dimension; the days still marked;
 * and the live figures the facts must equal (widgets/02 §0.1: counted orders and their revenue by placed day in the
 * store's timezone; refunds by refund day), for the facts' worker tests (M10.4). Refused in production.
 */
const FactsOf = HttpRouter.add(
  "GET",
  "/api/__dev/facts",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const db = yield* Db
    const facts = yield* db.scopedFor((sql) =>
      Effect.all({
        orders: sql`
          select store_id, day::text as day, country, product_id, supplier_id, channel, currency, orders, paid_orders,
                 counted_orders, counted_revenue_minor::int, units, revenue_minor::int, refunds, refunded_minor::int,
                 cancelled
          from fact_orders_day order by store_id, day, country, product_id, supplier_id, channel, currency`,
        refunds: sql`
          select store_id, day::text as day, reason, product_id, supplier_id, currency, refunds, amount_minor::int
          from fact_refunds_day order by store_id, day, reason, product_id, supplier_id, currency`,
        deliveries: sql`
          select store_id, day::text as day, supplier_id, country, parcels, on_time, late, days_late_sum, took_days_sum
          from fact_deliveries_day order by store_id, day, supplier_id, country`,
        marked: sql`select store_id, day::text as day from fact_dirty_days order by store_id, day`,
        live: sql`
          select o.store_id, (o.placed_at at time zone coalesce(s.timezone, w.timezone))::date::text as day,
                 o.currency, count(*)::int as counted_orders, sum(o.total_minor)::int as counted_revenue_minor
          from orders o join stores s on s.id = o.store_id join workspaces w on w.id = o.workspace_id
          where o.status not in ('cancelled', 'refunded') and not o.is_draft
            and o.payment_status in ('paid', 'partially_refunded')
          group by 1, 2, 3 order by 1, 2, 3`,
        liveRefunds: sql`
          select r.store_id, (r.created_at at time zone coalesce(s.timezone, w.timezone))::date::text as day,
                 r.currency, count(*)::int as refunds, sum(r.amount_minor)::int as amount_minor
          from refunds r join stores s on s.id = r.store_id join workspaces w on w.id = r.workspace_id
          where r.status = 'succeeded'
          group by 1, 2, 3 order by 1, 2, 3`
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace), Effect.orDie)
    return HttpServerResponse.jsonUnsafe(facts)
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/facts/drain?workspace=<id>`: every marked day drained now, as the sweep does; `&nightly=1` marks
 * the last three days first, as the nightly pass does. Refused in production.
 */
const FactsDrain = HttpRouter.add(
  "POST",
  "/api/__dev/facts/drain",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const nightly = new URL(request.url, "http://local").searchParams.get("nightly") === "1"
    const marked = nightly ? yield* markRecentWorkspace(workspace) : 0
    const drained = yield* drainWorkspace(workspace)
    return HttpServerResponse.jsonUnsafe({ marked, drained })
  }).pipe(Effect.orDie, withRequestDb)
)

/** `POST /api/__dev/facts/rebuild?workspace=<id>`: the facts rebuilt whole from the rows. Refused in production. */
const FactsRebuild = HttpRouter.add(
  "POST",
  "/api/__dev/facts/rebuild",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const rebuilt = yield* rebuildWorkspace((yield* workspaceParam) as WorkspaceId)
    return HttpServerResponse.jsonUnsafe({ rebuilt })
  }).pipe(Effect.orDie, withRequestDb)
)

export const FactsRoutes = Layer.mergeAll(FactsOrders, FactsOf, FactsDrain, FactsRebuild)

import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { RECORDED_BULK } from "@insyte/integrations-shopify/RecordedBulk"
import { addLine, emptyBatch, parseJsonl } from "@insyte/modules/stores/domain/Mirror"
import { applyBatch } from "@insyte/modules/stores/use-cases/mirror"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { userFrom } from "../../../platform/Sessions.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `GET /api/__dev/stores/connection?workspace=<id>&store=<id>`: a store's connection id, which names its gate (M6.3),
 * so the worker tests can ask the gate directly. Ids only. Refused in production.
 */
const StoreConnection = HttpRouter.add(
  "GET",
  "/api/__dev/stores/connection",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const store = new URL(request.url, "http://local").searchParams.get("store") ?? ""
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ connectionId: string }>`select connection_id from stores where id = ${store}`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ connectionId: row?.connectionId ?? null })
  }).pipe(withRequestDb)
)

/**
 * `GET /api/__dev/stores/mirror?workspace=<id>&store=<id>`: a store's mirrored orders and products by their states,
 * its deliveries and its stock-outs (M9.5), for the webhook, reconcile and stock-out tests. Refused in production.
 */
const StoreMirror = HttpRouter.add(
  "GET",
  "/api/__dev/stores/mirror",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const store = new URL(request.url, "http://local").searchParams.get("store") ?? ""
    const db = yield* Db
    const mirror = yield* db.scopedFor((sql) =>
      Effect.all({
        store: sql<{ status: string }>`select status from stores where id = ${store}`.pipe(
          Effect.map((rows) => rows[0]?.status ?? null)
        ),
        orders: sql<{ number: string; status: string; paymentStatus: string; customerName: string }>`
          select number, status, payment_status, customer_name from orders where store_id = ${store} order by number`,
        products: sql<{ title: string; status: string }>`
          select title, status from products where store_id = ${store} order by title`,
        customers: sql<{ name: string; email: string | null }>`
          select name, email from customers where store_id = ${store} order by shopify_id`,
        inbound: sql<{ topic: string; processed: boolean }>`
          select topic, processed_at is not null as processed from inbound_events where store_id = ${store}
          order by received_at`,
        gdpr: sql<{ kind: string; completed: boolean }>`
          select kind, completed_at is not null as completed from gdpr_requests order by received_at`,
        stockouts: sql<{ product: string; variant: string; open: boolean }>`
          select p.title as product, v.title as variant, s.to_at is null as open
          from stockouts s join variants v on v.id = s.variant_id join products p on p.id = s.product_id
          where s.store_id = ${store} order by s.from_at, v.title`
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe(mirror)
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/stores/seed`: the signed-in person's workspace gets the recorded twin's store, imported (three
 * products, three customers, five orders across their lifecycle), as a first import would leave it. Shopify is not
 * reached: the store has a connection without credentials, so it is for reading only. For the console's journey,
 * which has no Shopify to connect (previews never get one), and for a person trying a preview. Refused in production.
 */
const StoreSeed = HttpRouter.add(
  "POST",
  "/api/__dev/stores/seed",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const user = yield* userFrom(new Headers(request.headers as Record<string, string>))
    if (Option.isNone(user)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "unauthenticated" } }, { status: 401 })
    }
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return HttpServerResponse.jsonUnsafe({ error: { code: "no_workspace" } }, { status: 409 })
    const workspace = { id: active.workspaceId }
    const shop = `seed-${active.workspaceId.toLowerCase().replaceAll(/[^a-z0-9]/g, "")}.myshopify.com`
    const db = yield* Db
    const storeId = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [connection] = yield* sql<{ id: string }>`
          insert into connections (id, workspace_id, provider, account_ref, status, connected_by, last_synced_at)
          values (${mintId("con")}, app_workspace_id(), 'shopify', ${shop}, 'connected', ${active.principal.id}, now())
          on conflict (workspace_id, provider, account_ref) do update set status = 'connected'
          returning id`
        const [existing] = yield* sql<{ id: string }>`select id from stores where shop_domain = ${shop}`
        if (existing !== undefined) return existing.id
        const id = mintId("sto")
        yield* sql`
          insert into stores (id, workspace_id, connection_id, shop_domain, name, country, currency, timezone, plan_name,
                              status, connected_at, last_synced_at)
          values (${id}, app_workspace_id(), ${connection!.id}, ${shop}, 'Insyte MVP Test', 'NL', 'EUR',
                  'Europe/Amsterdam', 'development', 'connected', now(), now())`
        return id
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    const batch = emptyBatch()
    for (const text of Object.values(RECORDED_BULK)) for (const line of parseJsonl(text)) addLine(batch, line, "EUR")
    const written = yield* applyBatch(storeId, batch, { live: false }).pipe(
      Effect.provideService(CurrentWorkspace, workspace)
    )
    return HttpServerResponse.jsonUnsafe({ storeId, written })
  }).pipe(withRequestDb)
)

export const StoreRoutes = Layer.mergeAll(StoreSeed, StoreConnection, StoreMirror)

import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { RECORDED_BULK } from "@insyte/integrations-shopify/RecordedBulk"
import { registerParcels } from "@insyte/modules/returns/use-cases/parcels"
import { addLine, emptyBatch, parseJsonl } from "@insyte/modules/stores/domain/Mirror"
import { applyBatch } from "@insyte/modules/stores/use-cases/mirror"
import { sweepWorkspace } from "@insyte/modules/tracking/use-cases/tracking"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/**
 * `GET /api/__dev/mail?to=<address>`: the mails the capture adapter "sent" to one address, newest first. For the
 * worker tests, the e2e journey and a person trying a preview. Refused in production, and behind Access everywhere
 * else.
 */
const CapturedMail = HttpRouter.add(
  "GET",
  "/api/__dev/mail",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const to = new URL(request.url, "http://local").searchParams.get("to")?.toLowerCase() ?? ""
    const db = yield* Db
    const mails = yield* db.routing((sql) =>
      sql<{ kind: string; url: string | null; sentAt: Date }>`
        select kind, url, sent_at from captured_mail where to_address = ${to} order by sent_at desc, id desc limit 20`
    )
    return HttpServerResponse.jsonUnsafe({ mails })
  }).pipe(withRequestDb)
)

/**
 * `GET /api/__dev/auth-events?email=<address>`: what `auth_events` holds for one account, oldest first, for the worker
 * tests and the e2e journey. Refused in production. `auth_events` shows a person only their own rows, so this reads as
 * that user, setting `app.user_id` in its transaction; `Db` gains a door for that with Settings → Beveiliging (M3).
 */
const AuthEventsOf = HttpRouter.add(
  "GET",
  "/api/__dev/auth-events",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const email = new URL(request.url, "http://local").searchParams.get("email")?.toLowerCase() ?? ""
    const db = yield* Db
    const events = yield* db.routing((sql) =>
      sql.withTransaction(Effect.gen(function*() {
        const users = yield* sql<{ id: string }>`select id from auth."user" where email = ${email}`
        const userId = users[0]?.id
        if (userId === undefined) return []
        yield* sql`select set_config('app.user_id', ${userId}, true)`
        return yield* sql<{ kind: string; country: string | null }>`
          select kind, country from auth_events order by at, id`
      }))
    )
    return HttpServerResponse.jsonUnsafe({ events })
  }).pipe(withRequestDb)
)

const workspaceParam = Effect.map(
  HttpServerRequest.HttpServerRequest,
  (request) => new URL(request.url, "http://local").searchParams.get("workspace") ?? ""
)

const notInProduction = Effect.map(AppInfo, ({ environment }) => environment !== "production")

/**
 * `GET /api/__dev/outbox?workspace=<id>`: one workspace's outbox events and whether each was relayed, read in that
 * workspace's scope. For the relay's worker tests. Refused in production.
 */
const OutboxOf = HttpRouter.add(
  "GET",
  "/api/__dev/outbox",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const events = yield* db.scopedFor((sql) =>
      sql<
        {
          id: string
          event: string
          payload: Record<string, unknown>
          relayedAt: Date | null
          cancelled: boolean
          due: boolean
        }
      >`
        select id, event, payload, relayed_at, cancelled_at is not null as cancelled,
               coalesce(not_before, created_at) <= now() as due
        from outbox order by created_at`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ events })
  }).pipe(withRequestDb)
)

/**
 * `GET /api/__dev/product-events?workspace=<id>`: what the product-analytics sink captured for one workspace, where the
 * stage has no PostHog key (`captured_product_events`). Refused in production.
 */
const ProductEventsOf = HttpRouter.add(
  "GET",
  "/api/__dev/product-events",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const events = yield* db.routing((sql) =>
      sql<{ outboxId: string; event: string; distinctId: string; groups: Record<string, string> }>`
        select outbox_id, event, distinct_id, groups from captured_product_events
        where groups ->> 'workspace' = ${workspace} order by captured_at`
    )
    return HttpServerResponse.jsonUnsafe({ events })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/outbox/due?workspace=<id>`: ends the undo window of the workspace's events still waiting it out, as
 * if their seconds had passed, so a test need not sleep through them. Refused in production.
 */
const OutboxDue = HttpRouter.add(
  "POST",
  "/api/__dev/outbox/due",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const due = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`
        update outbox set not_before = now() - interval '1 second'
        where relayed_at is null and cancelled_at is null and not_before > now() returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ due: due.map((row) => row.id) })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/invitations/lapse?workspace=<id>&id=<invitation>`: the invitation's week is over, so the landing's
 * expired state can be tried without waiting it out. Refused in production.
 */
const InvitationLapse = HttpRouter.add(
  "POST",
  "/api/__dev/invitations/lapse",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const id = new URL(request.url, "http://local").searchParams.get("id") ?? ""
    const db = yield* Db
    const lapsed = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`
        update invitations set expires_at = now() - interval '1 day', sent_at = now() - interval '8 days'
        where id = ${id} returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ lapsed: lapsed.length })
  }).pipe(withRequestDb)
)

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
 * and its deliveries, for the webhook and reconcile tests (the lists come with M6.4). Refused in production.
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
          select kind, completed_at is not null as completed from gdpr_requests order by received_at`
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

/**
 * `POST /api/__dev/tracking/sweep?workspace=…`: one workspace's turn of the 15-minute tracking sweep (M8.4), with its
 * return parcels (M9.2), for the worker tests (the cron also reconciles every store). Refused in production.
 */
const TrackingSweep = HttpRouter.add(
  "POST",
  "/api/__dev/tracking/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    yield* sweepWorkspace().pipe(
      // …and the workspace's return parcels (M9.2), as the cron does.
      Effect.andThen(registerParcels()),
      Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }),
      Effect.orDie
    )
    return HttpServerResponse.jsonUnsafe({ swept: true })
  }).pipe(withRequestDb)
)

export const DevRoutes = Layer.mergeAll(
  StoreSeed,
  TrackingSweep,
  StoreConnection,
  StoreMirror,
  CapturedMail,
  AuthEventsOf,
  OutboxOf,
  OutboxDue,
  InvitationLapse,
  ProductEventsOf
)

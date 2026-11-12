import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { RECORDED_BULK } from "@insyte/integrations-shopify/RecordedBulk"
import { syncAdSpend } from "@insyte/modules/costs/Costs"
import { drainWorkspace, markRecentWorkspace, rebuildWorkspace } from "@insyte/modules/facts/Facts"
import { receive } from "@insyte/modules/inbox/use-cases/inbound"
import { isReplyAddress, receiveReply } from "@insyte/modules/notifications/use-cases/replies"
import { refreshWorkspace } from "@insyte/modules/queue/Queue"
import { registerParcels } from "@insyte/modules/returns/use-cases/parcels"
import { addLine, emptyBatch, type MirrorBatch, parseJsonl } from "@insyte/modules/stores/domain/Mirror"
import { applyBatch } from "@insyte/modules/stores/use-cases/mirror"
import { sweepWorkspace } from "@insyte/modules/tracking/use-cases/tracking"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AdSpendLive } from "../../platform/AdSpend.ts"
import { AppInfo } from "../../platform/Bindings.ts"
import { parseMail } from "../../platform/InboundMail.ts"
import { refusedReferences } from "../../platform/Mail.ts"
import { digestWorkspace, notifyWorkspace } from "../../platform/Relay.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/**
 * `GET /api/__dev/mail?to=<address>`: the mails the capture adapter "sent" to one address, newest first. For the
 * worker tests, the e2e journey and a person trying a preview. `&reference=<id>` keeps one record's (a return's shopper
 * mails, M9.3), since every test's recorded store mails the same shoppers. Refused in production, and behind Access
 * everywhere else.
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
    const query = new URL(request.url, "http://local").searchParams
    const to = query.get("to")?.toLowerCase() ?? ""
    const reference = query.get("reference")
    const db = yield* Db
    const mails = yield* db.routing((sql) =>
      sql<{
        kind: string
        url: string | null
        sender: string | null
        reference: string | null
        subject: string | null
        bodyText: string | null
        sentAt: Date
      }>`
        select kind, url, sender, reference, subject, body_text, sent_at from captured_mail
        where to_address = ${to} and (${reference}::text is null or reference = ${reference})
        order by sent_at desc, id desc limit 20`
    )
    return HttpServerResponse.jsonUnsafe({ mails })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/mail/refuse?reference=<id>`: the capture adapter refuses one record's mails from now on (an order's
 * delay mail, M10.2), as a bouncing address would, so a mail that does not go can be tried; `&off=1` takes it back.
 * Refused in production.
 */
const MailRefuse = HttpRouter.add(
  "POST",
  "/api/__dev/mail/refuse",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const reference = query.get("reference") ?? ""
    if (reference !== "" && query.get("off") === "1") refusedReferences.delete(reference)
    else if (reference !== "") refusedReferences.add(reference)
    return HttpServerResponse.jsonUnsafe({ refused: [...refusedReferences] })
  })
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
 * `GET /api/__dev/undo?workspace=<id>`: one workspace's undo compensations (command, compensation, spent), without the
 * hashes, read in that workspace's scope. For the tests that check what a compensation keeps. Refused in production.
 */
const UndoOf = HttpRouter.add(
  "GET",
  "/api/__dev/undo",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const tokens = yield* db.scopedFor((sql) =>
      sql<{ command: string; compensation: unknown; used: boolean }>`
        select command, compensation, used_at is not null as used from undo_tokens order by expires_at`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ tokens })
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
 * `POST /api/__dev/undo/age?workspace=<id>&seconds=<n>`: the workspace's undo windows as if `n` seconds had passed, so
 * a test can stand between a toast's eight seconds and a chat card's five minutes without sleeping. Refused in
 * production.
 */
const UndoAge = HttpRouter.add(
  "POST",
  "/api/__dev/undo/age",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const seconds = Number(new URL(request.url, "http://local").searchParams.get("seconds") ?? "0")
    const db = yield* Db
    const aged = yield* db.scopedFor((sql) =>
      sql<{ command: string }>`
        update undo_tokens set expires_at = expires_at - make_interval(secs => ${
        Number.isFinite(seconds) ? seconds : 0
      })
        where used_at is null returning command`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ aged: aged.length })
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
 * `POST /api/__dev/proposals/lapse?workspace=<id>&id=<proposal>`: the plate's deadline has passed (`expires_at`), so the
 * queue's refresh lets it expire (M10.2). No rule at M10 draws a plate with a deadline; chargebacks' evidence does
 * (M13). Refused in production.
 */
const ProposalLapse = HttpRouter.add(
  "POST",
  "/api/__dev/proposals/lapse",
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
        update proposals set expires_at = now() - interval '1 minute' where id = ${id} and state = 'open'
        returning id`
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

/**
 * `POST /api/__dev/queue/refresh?workspace=<id>`: the workspace's queue on Start brought in line now, as the 15-minute
 * sweep does (M10.1), for the worker tests (a stock-out has no event of its own). Refused in production.
 */
const QueueRefresh = HttpRouter.add(
  "POST",
  "/api/__dev/queue/refresh",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const changed = yield* refreshWorkspace(workspace as WorkspaceId).pipe(Effect.orDie)
    return HttpServerResponse.jsonUnsafe({ changed })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/notify/sweep?workspace=<id>&at=<iso>`: one workspace's turn of the notification sweeps (M11 step
 * 13.5) as if it were `at` (now when absent): the notes due then sent, and the digests whose hour has come; `&since=`
 * widens the digest's window to the notes since then, for a day that is not today. Refused in production.
 */
const NotifySweep = HttpRouter.add(
  "POST",
  "/api/__dev/notify/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const at = query.get("at") === null ? undefined : new Date(query.get("at")!)
    const since = query.get("since") === null ? undefined : new Date(query.get("since")!)
    const sent = yield* notifyWorkspace(workspace, at)
    const digests = yield* digestWorkspace(workspace, at, since)
    return HttpServerResponse.jsonUnsafe({ sent, digests })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/notify/deliveries?workspace=<id>`: the workspace's deliveries outside the app, newest first, ids,
 * channels, states, why one did not go, and a mail's answer token (M11 step 13.5). Refused in production.
 */
const NotifyDeliveries = HttpRouter.add(
  "GET",
  "/api/__dev/notify/deliveries",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const db = yield* Db
    const deliveries = yield* db.scopedFor((sql) =>
      sql<
        {
          recipientId: string
          channel: string
          kind: string
          state: string
          attempts: number
          error: string | null
          replyToken: string | null
        }
      >`
        select recipient_id, channel, kind, state, attempts, error, reply_token from notification_deliveries
        order by created_at desc limit 50`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ deliveries })
  }).pipe(Effect.orDie, withRequestDb)
)

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

/**
 * `POST /api/__dev/mail/inbound` `{ to, raw }`: a raw RFC 822 mail delivered to a forwarding address, as Cloudflare Email
 * Routing hands it to the Worker's `email()` handler (M11 step 1), down the same path, an answer to a notification mail
 * included (`{ reply }`, M11 step 13.5). For the worker tests, the
 * journey and a person trying a preview, where no MX points at the Worker. Refused in production.
 */
const InboundMail = HttpRouter.add(
  "POST",
  "/api/__dev/mail/inbound",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json.pipe(Effect.orDie)) as { readonly to?: unknown; readonly raw?: unknown }
    const { to, raw } = body
    if (typeof to !== "string" || typeof raw !== "string") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })
    }
    const mail = yield* Effect.promise(() => parseMail(raw))
    if (isReplyAddress(to)) {
      return HttpServerResponse.jsonUnsafe({
        reply: yield* receiveReply(to, mail.from.email, mail.text).pipe(Effect.orDie)
      })
    }
    const stored = yield* receive(to, mail).pipe(Effect.orDie)
    if (stored === undefined) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "unknown_address" } }, { status: 404 })
    }
    return HttpServerResponse.jsonUnsafe(stored)
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/costs/ad-account?workspace=<id>` `{ provider, status, spend: [{ day, spendMinor, currency? }] }`: an
 * ad account as a connection would leave it, with the spend it reported, for the costs' worker tests (M13 step 5): no
 * Meta or Google Ads account can be connected yet. `POST /api/__dev/costs/sync`: the daily ad spend sync now. Refused
 * in production.
 */
const CostsAdAccount = HttpRouter.add(
  "POST",
  "/api/__dev/costs/ad-account",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json) as {
      readonly provider: "meta" | "google_ads"
      readonly status?: string
      readonly spend?: ReadonlyArray<{ readonly day: string; readonly spendMinor: number; readonly currency?: string }>
    }
    const db = yield* Db
    const id = mintId("con")
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into connections (id, workspace_id, provider, account_ref, status)
                   values (${id}, ${workspace.id}, ${body.provider}, ${`act_${id}`}, ${body.status ?? "connected"})`
        for (const s of body.spend ?? []) {
          yield* sql`insert into ad_spend_day (workspace_id, connection_id, provider, account_ref, day, spend_minor,
                                               currency)
                     values (${workspace.id}, ${id}, ${body.provider}, ${`act_${id}`}, ${s.day}::date, ${s.spendMinor},
                             ${s.currency ?? "EUR"})`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ connectionId: id })
  }).pipe(Effect.orDie, withRequestDb)
)

const CostsSync = HttpRouter.add(
  "POST",
  "/api/__dev/costs/sync",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    return HttpServerResponse.jsonUnsafe({ written: yield* syncAdSpend() })
  }).pipe(Effect.provide(AdSpendLive), withRequestDb)
)

export const DevRoutes = Layer.mergeAll(
  CostsAdAccount,
  CostsSync,
  InboundMail,
  FactsOrders,
  FactsOf,
  FactsDrain,
  FactsRebuild,
  StoreSeed,
  TrackingSweep,
  QueueRefresh,
  NotifySweep,
  NotifyDeliveries,
  StoreConnection,
  StoreMirror,
  CapturedMail,
  MailRefuse,
  AuthEventsOf,
  OutboxOf,
  UndoOf,
  UndoAge,
  OutboxDue,
  InvitationLapse,
  ProposalLapse,
  ProductEventsOf
)

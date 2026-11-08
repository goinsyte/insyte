import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

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

export const DevRoutes = Layer.mergeAll(
  StoreConnection,
  CapturedMail,
  AuthEventsOf,
  OutboxOf,
  OutboxDue,
  InvitationLapse,
  ProductEventsOf
)

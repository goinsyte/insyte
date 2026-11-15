import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

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
 * `GET /api/__dev/audit?workspace=<id>`: one workspace's audit rows, oldest first, read in that workspace's scope. For
 * the worker tests of changes that write no settings line (a transfer of ownership, leaving). Only where nothing real
 * lives (`devOnly`): staging's audit log is people's, so it is refused there as in production.
 */
const AuditOf = HttpRouter.add(
  "GET",
  "/api/__dev/audit",
  Effect.gen(function*() {
    if (!(yield* devOnly)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const rows = yield* db.scopedFor((sql) =>
      sql<{ action: string; actorKind: string; actorId: string; subjectId: string; diff: Record<string, unknown> }>`
        select action, actor_kind, actor_id, subject_id, diff from audit_events order by at, id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ rows })
  }).pipe(withRequestDb)
)

export const OutboxRoutes = Layer.mergeAll(OutboxOf, OutboxDue, ProductEventsOf, AuditOf)

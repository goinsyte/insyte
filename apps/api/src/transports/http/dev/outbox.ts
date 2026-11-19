import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
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
          attempts: number
          deadLetteredAt: Date | null
          deadLetterReason: string | null
        }
      >`
        select id, event, payload, relayed_at, cancelled_at is not null as cancelled,
               coalesce(not_before, created_at) <= now() as due, attempts, dead_lettered_at, dead_letter_reason
        from outbox order by created_at`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ events })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/outbox/raw?workspace=<id>&event=<type>`: an outbox row as a raw insert writes one, with the body as
 * its payload, whatever its shape: for the relay's tests of a row that is not its event's. Only where nothing real lives.
 */
const OutboxRaw = HttpRouter.add(
  "POST",
  "/api/__dev/outbox/raw",
  Effect.gen(function*() {
    if (!(yield* devOnly)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const event = new URL(request.url, "http://local").searchParams.get("event") ?? ""
    const payload = yield* request.json
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`insert into outbox (id, workspace_id, event, payload)
                          values (${mintId("obx")}, ${workspace}, ${event}, ${JSON.stringify(payload)}::jsonb)
                          returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ id: row!.id })
  }).pipe(Effect.orDie, withRequestDb)
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

/**
 * `GET /api/__dev/pending-tasks?workspace=<id>`: the workspace's tasks kept until they run (W13.6, `pending_tasks`);
 * `POST /api/__dev/pending-tasks/due?workspace=<id>`: makes them due now, so a test need not wait ten minutes. Refused
 * in production.
 */
const PendingTasksOf = HttpRouter.add(
  "GET",
  "/api/__dev/pending-tasks",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const tasks = yield* db.scopedFor((sql) =>
      sql<{ kind: string; ref: string; attempts: number }>`
        select kind, ref, attempts from pending_tasks order by created_at`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ tasks })
  }).pipe(withRequestDb)
)

const PendingTasksDue = HttpRouter.add(
  "POST",
  "/api/__dev/pending-tasks/due",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const due = yield* db.scopedFor((sql) =>
      sql<{ ref: string }>`update pending_tasks set next_at = now() - interval '1 second' returning ref`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ due: due.map((row) => row.ref) })
  }).pipe(withRequestDb)
)

export const OutboxRoutes = Layer.mergeAll(
  OutboxOf,
  OutboxDue,
  OutboxRaw,
  ProductEventsOf,
  AuditOf,
  PendingTasksOf,
  PendingTasksDue
)

import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

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
 * `POST /api/__dev/undo/age?workspace=<id>&seconds=<n>`: the workspace's undo windows as if `n` seconds had passed, so
 * a test can stand between a toast's eight seconds and a chat card's five minutes without sleeping; the agent log's
 * windows age with them. Refused in production.
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
        where used_at is null returning command`.pipe(
        // An agent's action in the log keeps its own five minutes (M15 step 6).
        Effect.tap(() =>
          sql`update agent_actions set undo_until = undo_until - make_interval(secs => ${
            Number.isFinite(seconds) ? seconds : 0
          })
              where undo_until is not null`
        )
      )
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ aged: aged.length })
  }).pipe(withRequestDb)
)

export const UndoRoutes = Layer.mergeAll(UndoOf, UndoAge)

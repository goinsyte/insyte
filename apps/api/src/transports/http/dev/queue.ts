import { type WorkspaceId } from "@insyte/domain/Ids"
import { refreshWorkspace } from "@insyte/modules/queue/Queue"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/queue/refresh?workspace=<id>`: the workspace's queue on Start brought in line now, as the 15-minute
 * sweep does (M10.1), for the worker tests (a stock-out has no event of its own). Refused in production.
 */
export const QueueRefresh = HttpRouter.add(
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

import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { sweepWorkspace as sweepTrash } from "@insyte/modules/trash/use-cases/trash"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { TrashKindsLive } from "../../../platform/links/TrashKinds.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/trash/sweep?workspace=<id>&age=<days>`: the workspace's trashed tickets as if deleted `age` days
 * earlier, then the Prullenbak's daily sweep for that workspace (M17 step 20.1a), so the 30 days need not be waited
 * out. Refused in production.
 */
export const TrashSweep = HttpRouter.add(
  "POST",
  "/api/__dev/trash/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const age = Number(new URL(request.url, "http://local").searchParams.get("age") ?? "0")
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update tickets set deleted_at = deleted_at - make_interval(days => ${Number.isFinite(age) ? age : 0})
          where deleted_at is not null`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    const purged = yield* sweepTrash().pipe(
      Effect.provideService(CurrentWorkspace, { id: workspace }),
      Effect.provide(TrashKindsLive)
    )
    return HttpServerResponse.jsonUnsafe({ purged })
  }).pipe(Effect.orDie, withRequestDb)
)

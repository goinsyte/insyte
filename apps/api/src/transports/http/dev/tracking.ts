import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { registerParcels } from "@insyte/modules/returns/use-cases/parcels"
import { sweepWorkspace } from "@insyte/modules/tracking/use-cases/tracking"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/tracking/sweep?workspace=…`: one workspace's turn of the 15-minute tracking sweep (M8.4), with its
 * return parcels (M9.2), for the worker tests (the cron also reconciles every store). Refused in production.
 */
export const TrackingSweep = HttpRouter.add(
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

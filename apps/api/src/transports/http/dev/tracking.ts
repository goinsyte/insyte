import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { supplierLate } from "@insyte/modules/orders/use-cases/delays"
import { registerParcels } from "@insyte/modules/returns/use-cases/parcels"
import { sweepWorkspace } from "@insyte/modules/tracking/use-cases/tracking"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/tracking/sweep?workspace=…`: one workspace's turn of the 15-minute tracking sweep (M8.4), with its
 * return parcels (M9.2), for the worker tests (the cron also reconciles every store). Refused in production.
 */
const Sweep = HttpRouter.add(
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
 * `POST /api/__dev/orders/supplier-late?workspace=…&at=<iso>`: one workspace's turn of the hourly supplier check (M8.3)
 * as if it were `at` (now when absent); answers the outbox rows it wrote. Refused in production.
 */
const SupplierLate = HttpRouter.add(
  "POST",
  "/api/__dev/orders/supplier-late",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const at = new URL(request.url, "http://local").searchParams.get("at")
    const outboxIds = yield* supplierLate(at === null ? undefined : new Date(at)).pipe(
      Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }),
      Effect.orDie
    )
    return HttpServerResponse.jsonUnsafe({ outboxIds })
  }).pipe(withRequestDb)
)

/** The tracking sweep and the supplier check, the delay detectors (M8.3, M8.4). */
export const TrackingSweep = Layer.mergeAll(Sweep, SupplierLate)

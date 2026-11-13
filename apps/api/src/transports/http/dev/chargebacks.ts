import { type WorkspaceId } from "@insyte/domain/Ids"
import { remindWorkspace } from "@insyte/modules/chargebacks/Chargebacks"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/chargebacks/remind?workspace=<id>&at=<iso>`: one workspace's turn of the hourly deadline reminders
 * (M13 step 3) as if it were `at` (now when absent); answers the outbox rows it wrote. Refused in production.
 */
export const ChargebackRemind = HttpRouter.add(
  "POST",
  "/api/__dev/chargebacks/remind",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const at = new URL(request.url, "http://local").searchParams.get("at")
    const outboxIds = yield* remindWorkspace(workspace, at === null ? undefined : new Date(at))
    return HttpServerResponse.jsonUnsafe({ outboxIds })
  }).pipe(Effect.orDie, withRequestDb)
)

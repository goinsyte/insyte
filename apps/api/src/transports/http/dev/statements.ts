import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { closeWorkspace } from "@insyte/modules/suppliers/use-cases/statements"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction } from "./shared.ts"

/**
 * `POST /api/__dev/statements/close?workspace=<id>&month=YYYY-MM`: one workspace's monthly close of the supplier
 * statements (M13 step 6), as `MonthlyCloseWorkflow`'s step does, for the worker tests and a preview. Unlike the cron it
 * closes a month still running (what a test just shipped is this month's). Refused in production.
 */
export const StatementsClose = HttpRouter.add(
  "POST",
  "/api/__dev/statements/close",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const month = query.get("month") ?? ""
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })
    }
    const outcome = yield* closeWorkspace(month, { early: true }).pipe(
      Effect.provideService(CurrentWorkspace, { id: (query.get("workspace") ?? "") as WorkspaceId }),
      Effect.orDie
    )
    return HttpServerResponse.jsonUnsafe(outcome)
  }).pipe(withRequestDb)
)

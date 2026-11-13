import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/proposals/lapse?workspace=<id>&id=<proposal>`: the plate's deadline has passed (`expires_at`), so the
 * queue's refresh lets it expire (M10.2). No rule at M10 draws a plate with a deadline; chargebacks' evidence does
 * (M13). Refused in production.
 */
export const ProposalLapse = HttpRouter.add(
  "POST",
  "/api/__dev/proposals/lapse",
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
        update proposals set expires_at = now() - interval '1 minute' where id = ${id} and state = 'open'
        returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ lapsed: lapsed.length })
  }).pipe(withRequestDb)
)

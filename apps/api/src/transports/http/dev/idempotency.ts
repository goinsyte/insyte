import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/idempotency/abandon?workspace=<id>&key=<key>&seconds=<n>`: the workspace's answer kept for that
 * `Idempotency-Key` made into a claim `n` seconds old whose run never finished, as a Worker cut off mid-run leaves it,
 * so a test can stand on either side of the bound a caller gives the claim without waiting. Only where nothing real
 * lives.
 */
export const IdempotencyRoutes = HttpRouter.add(
  "POST",
  "/api/__dev/idempotency/abandon",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const params = new URL(request.url, "http://local").searchParams
    const key = params.get("key") ?? ""
    const seconds = Number(params.get("seconds") ?? "0")
    const db = yield* Db
    const abandoned = yield* db.scopedFor((sql) =>
      sql<{ key: string }>`
        update idempotency_keys
           set response = null, created_at = now() - make_interval(secs => ${Number.isFinite(seconds) ? seconds : 0})
         where key = ${key} returning key`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ abandoned: abandoned.length })
  }).pipe(withRequestDb)
)

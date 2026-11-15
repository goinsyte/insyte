import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { forgetLogo } from "../BrandRoutes.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/files/scan?workspace=…&file=…&state=clean|rejected`: a scan's verdict on one of the workspace's
 * files, for the worker tests (a public logo is never served once refused, M17 step 20.1b), as a scanner would give
 * it: refused, the logo leaves the edge cache too. Refused in production.
 */
export const FileScan = HttpRouter.add(
  "POST",
  "/api/__dev/files/scan",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const query = new URL((yield* HttpServerRequest.HttpServerRequest).url, "http://local").searchParams
    const state = query.get("state")
    if (state !== "clean" && state !== "rejected") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })
    }
    const db = yield* Db
    const rows = yield* db.scopedFor((sql) =>
      sql`update files set scan_state = ${state} where id = ${query.get("file") ?? ""} returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }), Effect.orDie)
    // Refused: a public logo leaves this data centre's edge cache at once.
    if (state === "rejected") yield* forgetLogo(workspace, query.get("file") ?? "")
    return HttpServerResponse.jsonUnsafe({ updated: rows.length })
  }).pipe(withRequestDb)
)

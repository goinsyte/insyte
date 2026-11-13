import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/privacy/deletion-due?workspace=<id>`: the workspace's waiting deletion as if its seven days were
 * over (M17 step 5), so a test can watch the purge without waiting them out. Refused in production.
 */
export const PrivacyRoutes = HttpRouter.add(
  "POST",
  "/api/__dev/privacy/deletion-due",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const db = yield* Db
    const rows = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`update gdpr_requests set due_at = now() - interval '1 minute'
                          where kind = 'workspace_delete' and state = 'waiting' returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ due: rows.length })
  }).pipe(Effect.orDie, withRequestDb)
)

import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `GET /api/__dev/automations/runs?workspace=<id>`: one workspace's flow runs with their steps, and the flows' service
 * accounts, read in that workspace's scope. For the engine's worker tests until the Runs tab reads them (M12 step 5).
 * Refused in production.
 */
export const AutomationRunsOf = HttpRouter.add(
  "GET",
  "/api/__dev/automations/runs",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const found = yield* db.scopedFor((sql) =>
      Effect.all({
        runs: sql`
          select id, automation_id, version, service_account_id, trigger_variant, record_id, status, reason
          from automation_runs order by started_at, id`,
        steps: sql`
          select run_id, node_id, attempt, variant, status, output, explanation
          from automation_run_steps order by started_at, node_id`,
        accounts: sql`
          select id, automation_id, label, scopes, version, disabled_at is not null as disabled
          from service_accounts order by created_at`
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe(found)
  }).pipe(withRequestDb)
)

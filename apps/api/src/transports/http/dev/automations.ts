import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { AutomationRuns } from "@insyte/modules/automations/domain/Ports"
import { startScheduled } from "@insyte/modules/automations/use-cases/engine"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { userFrom } from "../../../platform/Sessions.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

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

/**
 * `POST /api/__dev/automations/schedule?workspace=<id>&at=<iso>`: the hourly tick of "Op een vast moment" for one
 * workspace of the signed-in person (their first when none is named, for the e2e), as if it were `at` (now when
 * absent), so a test need not wait for the cron. Only locally and on a preview, and only for a member of that
 * workspace: it starts real runs at any moment it is told. Answers the runs it started.
 */
export const AutomationScheduleTick = HttpRouter.add(
  "POST",
  "/api/__dev/automations/schedule",
  Effect.gen(function*() {
    if (!(yield* devOnly)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const named = yield* workspaceParam
    const user = yield* userFrom(new Headers(request.headers as Record<string, string>))
    if (Option.isNone(user)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "unauthenticated" } }, { status: 401 })
    }
    const mine = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    const own = named === "" ? mine[0] : mine.find((m) => m.workspaceId === named)
    if (own === undefined) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "no_workspace" } }, { status: 409 })
    }
    const workspace = own.workspaceId
    const asked = new URL(request.url, "http://local").searchParams.get("at")
    const at = asked === null ? new Date() : new Date(asked)
    if (Number.isNaN(at.getTime())) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "invalid", message: "at is no date" } }, { status: 400 })
    }
    const runs = yield* startScheduled(at).pipe(
      Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId })
    )
    const starter = yield* AutomationRuns
    for (const runId of runs) yield* starter.start({ workspaceId: workspace, runId })
    return HttpServerResponse.jsonUnsafe({ runs })
  }).pipe(withRequestDb)
)

import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { dueWorkspaces } from "@insyte/modules/settings/use-cases/retention"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { retentionWorkspace } from "../../../platform/Retention.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * Retention's worker tests (M17 step 20.1b), refused in production: `POST /api/__dev/retention/age?workspace=<id>
 * &thread=<id>&days=<n>` puts a mail thread's last message that many days back; `POST /api/__dev/retention/erase
 * ?workspace=<id>` runs the workspace's nightly erase now; `GET /api/__dev/retention/due?at=<iso>` lists the
 * workspaces the sweep would erase at that time.
 */
const RetentionAge = HttpRouter.add(
  "POST",
  "/api/__dev/retention/age",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const days = Number(query.get("days") ?? "0")
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update email_threads set last_message_at = now() - make_interval(days => ${days})
          where id = ${query.get("thread") ?? ""}`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ aged: true })
  }).pipe(Effect.orDie, withRequestDb)
)

const RetentionErase = HttpRouter.add(
  "POST",
  "/api/__dev/retention/erase",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    return HttpServerResponse.jsonUnsafe({ erased: yield* retentionWorkspace(workspace) })
  }).pipe(Effect.orDie, withRequestDb)
)

const RetentionDue = HttpRouter.add(
  "GET",
  "/api/__dev/retention/due",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const at = new Date(new URL(request.url, "http://local").searchParams.get("at") ?? Date.now())
    return HttpServerResponse.jsonUnsafe({ workspaces: yield* dueWorkspaces(at) })
  }).pipe(Effect.orDie, withRequestDb)
)

export const RetentionRoutes = Layer.mergeAll(RetentionAge, RetentionErase, RetentionDue)

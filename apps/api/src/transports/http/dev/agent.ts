import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { OfflinePlan } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
const invalid = HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })

/**
 * `GET /api/__dev/agent/actions?workspace=<id>`: every row of one workspace's agent log (M15 step 6), oldest first,
 * whatever was decided: the log's page lists only what ran, and the agent sink's tests check what it asked and refused
 * too. No reasons or labels: what it was about, by id. Refused in production.
 */
const ActionsOf = HttpRouter.add(
  "GET",
  "/api/__dev/agent/actions",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return refused
    const workspace = yield* workspaceParam
    const db = yield* Db
    const actions = yield* db.scopedFor((sql) =>
      sql<{
        id: string
        action: string
        principalKind: string
        trigger: string
        decision: string
        outcome: string
        refuseReason: string | null
        subjectType: string | null
        subjectId: string | null
        storeId: string | null
        model: string | null
        undoable: boolean
      }>`
        select id, action, principal_kind, trigger, decision, outcome, refuse_reason, subject_type, subject_id,
               store_id, model, undo_token_hash is not null as undoable
        from agent_actions order by created_at, id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ actions })
  }).pipe(withRequestDb)
)

const Setup = Schema.Struct({
  /** The agent's stores (`agents.scopes.stores`); `null`, every store. */
  stores: Schema.optional(Schema.NullOr(Schema.Array(Schema.String.check(Schema.isMaxLength(64))))),
  /** The offline plan as the offline step writes it, on the workspace's first analysis; `null`, none. */
  offline: Schema.optional(Schema.NullOr(OfflinePlan))
})
const decodeSetup = Schema.decodeUnknownEffect(Setup)

/**
 * `POST /api/__dev/agent/setup?workspace=<id>` `{ stores?, offline? }`: the workspace's agent held to these stores, and
 * the offline plan its first analysis keeps, as the onboarding's offline step would have agreed it; for the agent sink's
 * tests of the store fence and the opening hours without walking the onboarding. Locally and on a preview only.
 */
const AgentSetup = HttpRouter.add(
  "POST",
  "/api/__dev/agent/setup",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeSetup), Effect.option)
    if (Option.isNone(body)) return invalid
    const { stores, offline } = body.value
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        if (stores !== undefined) {
          const scopes = JSON.stringify(stores === null ? {} : { stores })
          yield* sql`insert into agents (id, workspace_id, scopes) values (${mintId("agt")}, ${workspace.id}, ${scopes})
                     on conflict (workspace_id) do update set scopes = excluded.scopes`
        }
        if (offline !== undefined) {
          yield* sql`insert into first_analyses (id, workspace_id, store_id)
                     select ${mintId("fan")}, ${workspace.id}, s.id from stores s order by s.created_at limit 1
                     on conflict (store_id) do nothing`
          yield* sql`update first_analyses set offline = ${offline === null ? null : JSON.stringify(offline)},
                                               offline_at = ${offline === null ? null : new Date()}`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ ok: true })
  }).pipe(Effect.orDie, withRequestDb)
)

export const AgentRoutes = Layer.mergeAll(ActionsOf, AgentSetup)

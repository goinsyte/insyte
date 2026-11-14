import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `GET /api/__dev/ai/calls?workspace=<id>`: one workspace's model calls (M15 step 1) as `model_calls` keeps them, oldest
 * first: what each was for, which prompt and model, what it cost, how it ended, and about what. No text: none is kept.
 * And how many reservations are still open (`ai_reservations` not settled). For the tests that check every call is
 * metered. Refused in production.
 */
const AiCallsOf = HttpRouter.add(
  "GET",
  "/api/__dev/ai/calls",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const db = yield* Db
    const { calls, open } = yield* db.scopedFor((sql) =>
      Effect.all({
        calls: sql<{
          purpose: string
          prompt: string
          provider: string
          memberId: string | null
          costMicros: number
          outcome: string
          subjectType: string | null
          subjectId: string | null
        }>`
        select purpose, prompt_id || '@' || prompt_version as prompt, provider, member_id,
               cost_micros::float8 as cost_micros, outcome, subject_type, subject_id
        from model_calls order by created_at, id`,
        open: Effect.map(
          sql<{ n: number }>`select count(*)::int as n from ai_reservations where settled_at is null`,
          ([r]) => r?.n ?? 0
        )
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ calls, openReservations: open })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/ai/spent?workspace=<id>` `{ memberId, cents }`: a call already billed this month, worth that many euro
 * cents at today's rate, against a person's budget (`memberId`) or the background's (`null`). The fake model bills
 * nothing, so the budget warnings' tests spend this way first. Refused in production.
 */
const AiSpent = HttpRouter.add(
  "POST",
  "/api/__dev/ai/spent",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json) as { readonly memberId: string | null; readonly cents: number }
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`insert into model_calls (id, workspace_id, member_id, principal_kind, purpose, prompt_id, prompt_version,
                                   provider, model, cost_micros, outcome)
          values (${mintId("mcl")}, ${workspace.id}, ${body.memberId}, 'member', 'draft', 'reply_draft', 'dev', 'fake',
                  'fake', round(${body.cents} * 10000 / coalesce((select f.rate from fx_rates f
                                                                   where f.base = 'USD' and f.quote = 'EUR'
                                                                   order by f.day desc limit 1), 1)), 'ok')`
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ ok: true })
  }).pipe(Effect.orDie, withRequestDb)
)

export const AiRoutes = Layer.mergeAll(AiCallsOf, AiSpent)

import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `GET /api/__dev/ai/calls?workspace=<id>`: one workspace's model calls (M15 step 1) as `model_calls` keeps them, oldest
 * first: what each was for, which prompt and model, what it cost, how it ended, and about what. No text: none is kept.
 * And how many reservations are still open (`ai_reservations` not settled). For the tests that check every call is
 * metered. Refused in production.
 */
export const AiCallsOf = HttpRouter.add(
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

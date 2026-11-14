import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { lockBudgets, noteCrossings } from "@insyte/modules/ai/use-cases/call"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

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

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
const invalid = HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })

const DAY = 86_400_000

const Spent = Schema.Struct({
  memberId: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
  /** Euro cents, at today's rate: up to € 1.000. */
  cents: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100_000)),
  /** When it was billed, up to 62 days back; absent, now. */
  at: Schema.optional(Schema.String.check(Schema.isMaxLength(40))),
  /** Still out: a reservation not settled yet instead of a billed call. */
  open: Schema.optional(Schema.Boolean)
})
const decodeSpent = Schema.decodeUnknownEffect(Spent)

/**
 * `POST /api/__dev/ai/spent?workspace=<id>` `{ memberId, cents, at?, open? }`: a call billed against a person's budget
 * (`memberId`) or the background's (`null`), worth that many euro cents at today's rate, then the budgets' marks as a
 * settlement makes them (`noteCrossings`, their events left for the relay); or, `open`, a reservation still out. The
 * fake model bills nothing, so the budget warnings' tests spend this way. Locally and on a preview only: it writes
 * billing rows.
 */
const AiSpent = HttpRouter.add(
  "POST",
  "/api/__dev/ai/spent",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeSpent), Effect.option)
    if (Option.isNone(body)) return invalid
    const { memberId, cents, at, open } = body.value
    const when = at === undefined ? new Date() : new Date(at)
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() || when.getTime() < Date.now() - 62 * DAY) {
      return invalid
    }
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* lockBudgets(sql)
        const micros = sql`round(${cents} * 10000 / coalesce((select f.rate from fx_rates f
                                                               where f.base = 'USD' and f.quote = 'EUR'
                                                               order by f.day desc limit 1), 1))`
        if (open === true) {
          yield* sql`insert into ai_reservations (id, workspace_id, member_id, prompt_id, cost_micros, created_at)
                     values (${mintId("air")}, ${workspace.id}, ${memberId}, 'reply_draft', ${micros}, ${when})`
          return
        }
        yield* sql`insert into model_calls (id, workspace_id, member_id, principal_kind, purpose, prompt_id,
                                            prompt_version, provider, model, cost_micros, outcome, created_at)
                   values (${mintId("mcl")}, ${workspace.id}, ${memberId}, 'member', 'draft', 'reply_draft', 'dev',
                           'fake', 'fake', ${micros}, 'ok', ${when})`
        yield* noteCrossings(sql, memberId)
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ ok: true })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `POST /api/__dev/ai/marks-earlier?workspace=<id>`: the workspace's budget marks (`warned_at`, `reached_at`) a month
 * back, as if they were said last month; for the test that a new month says them again. Locally and on a preview only.
 */
const MarksEarlier = HttpRouter.add(
  "POST",
  "/api/__dev/ai/marks-earlier",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const db = yield* Db
    const moved = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`update ai_budgets set warned_at = warned_at - interval '1 month',
                                                reached_at = reached_at - interval '1 month'
                          where warned_at is not null or reached_at is not null returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ moved: moved.length })
  }).pipe(Effect.orDie, withRequestDb)
)

export const AiRoutes = Layer.mergeAll(AiCallsOf, AiSpent, MarksEarlier)

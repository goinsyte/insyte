import { mintId } from "@insyte/domain/Ids"
import { Cause, Effect, Exit, Option } from "effect"
import { AiError, LanguageModel, Prompt } from "effect/ai"
import type { SqlClient, SqlError } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  AiModel,
  BudgetExceeded,
  CallSettings,
  type Meter,
  type ModelInfo,
  ModelUnavailable,
  type Tokens
} from "../domain/Ai.ts"
import type { PromptDef } from "../prompts/Prompt.ts"

/*
 * One model call (M15 step 1; ai.md §7, §8): its worst case reserved against the budget, the model, then the row in
 * `model_calls` with what the provider billed, whatever the outcome. No prompt or answer text is stored.
 *
 * - The reservation is the prompt's whole room (its input, `maxTokens` of output) at the model's price, held in
 *   `ai_reservations` under the workspace's lock until the row is in, so two calls at once cannot both spend the
 *   last of a budget. `ai_month_used` counts it until it is settled.
 * - What a call costs is the usage the provider reported, whether or not its answer was any good: an answer that does
 *   not decode, one cut off at the limit and a refusal are all billed. When no usage came back and the request may
 *   have run (a timeout, the caller gone, a dropped connection), it costs the worst case. A request the provider turned
 *   away (an HTTP error) and one never sent cost nothing.
 * - From the reservation to the row the call cannot be interrupted, except the model's own wait: a person who leaves
 *   the page still leaves a row, and the reservation is settled.
 *
 * The model is called outside any transaction where the caller can (`inTx` opens one per step on a request); in
 * background work already inside one, the same transaction serves all three.
 */

/** A transaction to run a step in: `db.scoped` on a request, the open one in background work. */
export type InTx<Extra = never> = <A, E, R>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E | SqlError.SqlError, R | Extra>

export interface Caller {
  /** Whose budget it counts against; `null` is background work. */
  readonly memberId: string | null
  readonly principalKind: string
  readonly subject: { readonly type: string; readonly id: string } | null
  /** A test-chat call (`ChannelAgent.test`): metered and budgeted, flagged. */
  readonly test?: boolean | undefined
}

export interface Called<O> {
  readonly value: O
  readonly callId: string
  readonly model: ModelInfo
}

const euros = (micros: number) => Math.round(micros / 10_000) / 100

const NONE: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** Dollar micros for these tokens at this price (dollars per million tokens). */
export const costOf = (price: ModelInfo["price"], t: Tokens) =>
  Math.round(
    t.input * price.input + t.output * price.output + t.cacheRead * price.cacheRead +
      t.cacheWrite * price.cacheWrite
  )

/**
 * The most a call of this prompt with this input can bill: its text at three characters a token (Dutch runs nearer
 * four), and every token of its room as output.
 */
export const worstCase = <I, O>(prompt: PromptDef<I, O>, rendered: string): Tokens => ({
  input: Math.ceil((prompt.system.length + rendered.length) / 3) + 50,
  output: prompt.maxTokens,
  cacheRead: 0,
  cacheWrite: 0
})

/**
 * The month's limits against the month's use with this call's worst case (in dollar micros, at today's rate) added;
 * the first one it would overspend refuses the call. A limit already reached refuses even a call that costs nothing.
 */
export const checkBudget = Effect.fn("Ai.checkBudget")(
  function*(sql: SqlClient.SqlClient, memberId: string | null, worstMicros = 0) {
    const limits = yield* sql<{ memberId: string | null; limitMinor: string | null }>`
      select member_id, monthly_limit_minor as limit_minor from ai_budgets
      where monthly_limit_minor is not null and (member_id is null or member_id = ${memberId})`
    for (const scope of ["workspace", "member"] as const) {
      const row = limits.find((l) => (scope === "workspace" ? l.memberId === null : l.memberId !== null))
      if (row === undefined || row.limitMinor === null) continue
      const [use] = yield* sql<{ used: string; worst: string }>`
        select ai_month_used(${scope === "workspace" ? null : memberId}) as used,
               round(${worstMicros} * coalesce((select f.rate from fx_rates f where f.base = 'USD' and f.quote = 'EUR'
                                                 order by f.day desc limit 1), 1)) as worst`
      const used = Number(use?.used ?? 0)
      const limit = Number(row.limitMinor) * 10_000
      if (used >= limit || used + Number(use?.worst ?? 0) > limit) {
        return yield* new BudgetExceeded({ scope, limit: Math.round(Number(row.limitMinor) / 100), used: euros(used) })
      }
    }
  }
)

/**
 * The call's worst case held against the budget, under the workspace's lock so the check and the hold are one step.
 * With a `dedupeKey`, a second call for the same thing while the first is out finds it held: `busy`.
 */
export const reserve = Effect.fn("Ai.reserve")(function*(
  sql: SqlClient.SqlClient,
  caller: Caller,
  promptId: string,
  worstMicros: number,
  dedupeKey: string | undefined
) {
  yield* sql`select pg_advisory_xact_lock(hashtextextended('ai_budget:' || app_workspace_id(), 0))`
  yield* checkBudget(sql, caller.memberId, worstMicros)
  const id = mintId("air")
  const held = yield* sql`
    insert into ai_reservations (id, workspace_id, member_id, prompt_id, cost_micros, dedupe_key)
    values (${id}, app_workspace_id(), ${caller.memberId}, ${promptId}, ${worstMicros}, ${dedupeKey ?? null})
    on conflict do nothing returning id`
  if (held.length === 0) return yield* new ModelUnavailable({ reason: "busy" })
  return id
})

/**
 * The budgets a settled call carried past their warning (`warn_at_pct`, 80% unless set) or their limit this month
 * (M15 step 1): each marked (`warned_at`, `reached_at`) and said once a month, as an `ai.budget_crossed` event the
 * notifications sink turns into `insyte.budget`. A call that jumps past both says only that the limit is reached. A
 * reservation keeps a settled call inside its limit, so the limit is mostly reached when a call is refused for it
 * (`refused`, the budget that refused it): that budget is spent for this month's calls. A mark from an earlier month
 * counts as none; a new limit clears both (`AiBudget.setMany`). Under the workspace's budget lock, so two calls at once
 * say it once.
 */
export const noteCrossings = Effect.fn("Ai.noteCrossings")(
  function*(sql: SqlClient.SqlClient, memberId: string | null, refused: "workspace" | "member" | null = null) {
    yield* sql`select pg_advisory_xact_lock(hashtextextended('ai_budget:' || app_workspace_id(), 0))`
    const crossed = yield* sql<{
      id: string
      memberId: string | null
      workspaceId: string
      reached: boolean
      used: string
      limitMinor: string
    }>`
    with month as (
      select (date_trunc('month', now() at time zone coalesce(w.timezone, 'Europe/Amsterdam'))
              at time zone coalesce(w.timezone, 'Europe/Amsterdam')) as start
      from workspaces w where w.id = app_workspace_id()
    ),
    b as (
      select b.id, b.member_id, b.monthly_limit_minor, ai_month_used(b.member_id) as used,
             b.monthly_limit_minor::numeric * 10000 as limit_micros, b.warn_at_pct,
             coalesce(b.warned_at >= month.start, false) as warned,
             coalesce(b.reached_at >= month.start, false) as was_reached
      from ai_budgets b cross join month
      where b.monthly_limit_minor > 0 and (b.member_id is null or b.member_id = ${memberId})
    ),
    hit as (
      select b.*,
             (b.used >= b.limit_micros
               or (b.member_id is null and coalesce(${refused}::text, '') = 'workspace')
               or (b.member_id is not null and coalesce(${refused}::text, '') = 'member')) as at_limit,
             b.used * 100 >= b.limit_micros * b.warn_at_pct as at_warn
      from b
    )
    update ai_budgets a
    set warned_at = case when hit.at_warn and not hit.warned then now() else a.warned_at end,
        reached_at = case when hit.at_limit and not hit.was_reached then now() else a.reached_at end
    from hit
    where a.id = hit.id and ((hit.at_warn and not hit.warned) or (hit.at_limit and not hit.was_reached))
    returning a.id, a.member_id, a.workspace_id, (hit.at_limit and not hit.was_reached) as reached, hit.used::text as used,
              hit.monthly_limit_minor::text as limit_minor`
    for (const c of crossed) {
      const id = yield* Outbox.write(sql, c.workspaceId, {
        type: "ai.budget_crossed",
        workspaceId: c.workspaceId,
        budgetId: c.id,
        memberId: c.memberId,
        level: c.reached ? "reached" : "warn",
        usedCents: Math.round(Number(c.used) / 10_000),
        limit: Math.round(Number(c.limitMinor) / 100)
      })
      ;(yield* PendingEvents)?.add(id)
    }
  }
)

const outcomeOf = (error: AiError.AiError) =>
  error.reason._tag === "ContentPolicyError" ? "refused" as const : "error" as const

/** A fresh meter: nothing sent, nothing seen. */
export const meter = (): Meter => ({ sent: false, rejected: false, usage: undefined })

/**
 * The model's answer for this prompt and input, and how long it took; a failure is an exit, not an error. `restore`
 * is the one part a caller's interruption may stop (`call`'s mask).
 */
export const generate = <I, O>(
  prompt: PromptDef<I, O>,
  input: I,
  seen: Meter = meter(),
  restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> = (effect) => effect
) =>
  Effect.gen(function*() {
    const started = Date.now()
    const exit = yield* restore(
      LanguageModel.generateObject({
        prompt: Prompt.make([
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.render(input) }
        ]),
        schema: prompt.output,
        objectName: prompt.id
      }).pipe(
        Effect.provideService(CallSettings, {
          promptId: `${prompt.id}@${prompt.version}`,
          effort: prompt.effort,
          maxTokens: prompt.maxTokens,
          fake: () => prompt.fake(input),
          meter: seen
        }),
        Effect.timeout(`${prompt.timeoutSeconds ?? 90} seconds`)
      )
    ).pipe(Effect.exit)
    return { exit, latencyMs: Date.now() - started }
  })

/** What the call is billed: what the provider said, else nothing if it never ran, else the worst case. */
export const billed = (
  seen: Meter,
  exit: Exit.Exit<{ readonly usage: LanguageModel.GenerateObjectResponse<never, unknown>["usage"] }, unknown>,
  worst: Tokens
): Tokens => {
  if (seen.usage !== undefined) return seen.usage
  if (Exit.isSuccess(exit)) {
    const usage = exit.value.usage
    return {
      input: usage.inputTokens.uncached ?? usage.inputTokens.total ?? 0,
      output: usage.outputTokens.total ?? 0,
      cacheRead: usage.inputTokens.cacheRead ?? 0,
      cacheWrite: usage.inputTokens.cacheWrite ?? 0
    }
  }
  return seen.rejected || !seen.sent ? NONE : worst
}

export interface CallOptions<O> {
  /**
   * What the answer must pass before anyone sees it (a figure the input never had, §6.2): failing it, the call is
   * recorded as `guardrail_blocked` and the caller gets `ModelUnavailable` with `blocked`.
   */
  readonly guard?: ((output: O) => boolean) | undefined
  /** One call at a time for this key (a thread's first draft for its last message): a second is `busy`. */
  readonly dedupeKey?: string | undefined
}

/** Reservation, model, row: the call as every slice makes it. */
export const call = <I, O, X>(
  inTx: InTx<X>,
  caller: Caller,
  prompt: PromptDef<I, O>,
  input: I,
  options: CallOptions<O> = {}
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      const model = yield* AiModel
      if (!model.ready) return yield* new ModelUnavailable({ reason: "unconfigured" })
      const worst = worstCase(prompt, prompt.render(input))
      const reservation = yield* inTx((sql) =>
        reserve(sql, caller, prompt.id, costOf(model.price, worst), options.dedupeKey)
      ).pipe(
        // A budget that refuses the call is spent for this month: whoever sets the limits hears it, once.
        Effect.tapError((error) =>
          error instanceof BudgetExceeded
            ? Effect.ignore(inTx((sql) => noteCrossings(sql, caller.memberId, error.scope)))
            : Effect.void
        )
      )
      const seen = meter()
      const { exit, latencyMs } = yield* generate(prompt, input, seen, restore)
      const tokens = billed(seen, exit as Parameters<typeof billed>[1], worst)
      const error = Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined
      const blocked = Exit.isSuccess(exit) && options.guard !== undefined && !options.guard(exit.value.value as O)
      const outcome = blocked
        ? "guardrail_blocked" as const
        : Exit.isSuccess(exit)
        ? "ok" as const
        : error !== undefined && AiError.isAiError(error)
        ? outcomeOf(error)
        : "error" as const
      const said = Exit.isSuccess(exit)
        ? null
        : error !== undefined
        ? String(error).slice(0, 500)
        : Cause.hasInterrupts(exit.cause)
        ? "interrupted"
        : "defect"
      const callId = mintId("mcl")
      yield* inTx((sql) =>
        Effect.gen(function*() {
          yield* sql`insert into model_calls (id, workspace_id, member_id, principal_kind, purpose, prompt_id,
                                              prompt_version, provider, model, input_tokens, output_tokens,
                                              cached_tokens, cache_write_tokens, cost_micros, latency_ms, outcome,
                                              error, subject_type, subject_id, test)
              values (${callId}, app_workspace_id(), ${caller.memberId}, ${caller.principalKind}, ${prompt.purpose},
                      ${prompt.id}, ${prompt.version}, ${model.provider}, ${model.model}, ${tokens.input},
                      ${tokens.output}, ${tokens.cacheRead}, ${tokens.cacheWrite}, ${costOf(model.price, tokens)},
                      ${latencyMs}, ${outcome}, ${said},
                      ${caller.subject?.type ?? null}, ${caller.subject?.id ?? null}, ${caller.test ?? false})`
          yield* sql`update ai_reservations set settled_at = now(), model_call_id = ${callId}
                     where id = ${reservation}`
          yield* noteCrossings(sql, caller.memberId)
        })
      )
      if (Exit.isFailure(exit) || blocked) {
        yield* Effect.logWarning("a model call did not answer", { prompt: prompt.id, outcome })
        return yield* new ModelUnavailable({
          reason: outcome === "refused" ? "refused" : outcome === "guardrail_blocked" ? "blocked" : "failed"
        })
      }
      return { value: exit.value.value as O, callId, model } satisfies Called<O>
    })
  ).pipe(Effect.withSpan("Ai.call", { attributes: { prompt: prompt.id, purpose: prompt.purpose } }))

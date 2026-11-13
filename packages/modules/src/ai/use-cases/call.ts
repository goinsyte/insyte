import { mintId } from "@insyte/domain/Ids"
import { Effect, Exit, Option } from "effect"
import { AiError, LanguageModel, Prompt } from "effect/ai"
import type { SqlClient, SqlError } from "effect/sql"
import { AiModel, BudgetExceeded, CallSettings, type ModelInfo, ModelUnavailable } from "../domain/Ai.ts"
import type { PromptDef } from "../prompts/Prompt.ts"

/*
 * One model call (M15 step 1; ai.md §7, §8): the budget first, the model, then the row in `model_calls`, whatever the
 * outcome. The model is called outside any transaction where the caller can (`inTx` opens one per step on a request);
 * in background work already inside one, the same transaction serves all three. No prompt or answer text is stored.
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

/** The month's limits against the month's use; the first one spent refuses the call. */
export const checkBudget = Effect.fn("Ai.checkBudget")(function*(sql: SqlClient.SqlClient, memberId: string | null) {
  const limits = yield* sql<{ memberId: string | null; limitMinor: string | null }>`
    select member_id, monthly_limit_minor as limit_minor from ai_budgets
    where monthly_limit_minor is not null and (member_id is null or member_id = ${memberId})`
  for (const scope of ["workspace", "member"] as const) {
    const row = limits.find((l) => (scope === "workspace" ? l.memberId === null : l.memberId !== null))
    if (row === undefined || row.limitMinor === null) continue
    const [use] = yield* sql<{ used: string }>`
      select ai_month_used(${scope === "workspace" ? null : memberId}) as used`
    const used = Number(use?.used ?? 0)
    const limit = Number(row.limitMinor)
    if (used >= limit * 10_000) {
      return yield* new BudgetExceeded({ scope, limit: Math.round(limit / 100), used: euros(used) })
    }
  }
})

/** Dollar micros for these tokens at this price (dollars per million tokens). */
export const costOf = (
  price: ModelInfo["price"],
  t: { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number }
) =>
  Math.round(
    t.input * price.input + t.output * price.output + t.cacheRead * price.cacheRead +
      t.cacheWrite * price.cacheWrite
  )

const outcomeOf = (error: AiError.AiError) =>
  error.reason._tag === "ContentPolicyError" ? "refused" as const : "error" as const

/** The model's answer for this prompt and input, and how long it took; a failure is an exit, not an error. */
export const generate = <I, O>(prompt: PromptDef<I, O>, input: I) =>
  Effect.gen(function*() {
    const started = Date.now()
    const exit = yield* LanguageModel.generateObject({
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
        fake: () => prompt.fake(input)
      }),
      Effect.timeout(`${prompt.timeoutSeconds ?? 90} seconds`),
      Effect.exit
    )
    return { exit, latencyMs: Date.now() - started }
  })

export interface CallOptions<O> {
  /**
   * What the answer must pass before anyone sees it (a figure the input never had, §6.2): failing it, the call is
   * recorded as `guardrail_blocked` and the caller gets `ModelUnavailable` with `blocked`.
   */
  readonly guard?: ((output: O) => boolean) | undefined
}

/** Budget, model, row: the call as every slice makes it. */
export const call = <I, O, X>(
  inTx: InTx<X>,
  caller: Caller,
  prompt: PromptDef<I, O>,
  input: I,
  options: CallOptions<O> = {}
) =>
  Effect.gen(function*() {
    const model = yield* AiModel
    yield* inTx((sql) => checkBudget(sql, caller.memberId))
    const { exit, latencyMs } = yield* generate(prompt, input)
    const usage = Exit.isSuccess(exit) ? exit.value.usage : undefined
    const tokens = {
      input: usage?.inputTokens.uncached ?? usage?.inputTokens.total ?? 0,
      output: usage?.outputTokens.total ?? 0,
      cacheRead: usage?.inputTokens.cacheRead ?? 0,
      cacheWrite: usage?.inputTokens.cacheWrite ?? 0
    }
    const error = Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined
    const blocked = Exit.isSuccess(exit) && options.guard !== undefined && !options.guard(exit.value.value as O)
    const outcome = blocked
      ? "guardrail_blocked" as const
      : Exit.isSuccess(exit)
      ? "ok" as const
      : error !== undefined && AiError.isAiError(error)
      ? outcomeOf(error)
      : "error" as const
    const said = Exit.isSuccess(exit) ? null : error === undefined ? "defect" : String(error).slice(0, 500)
    const callId = mintId("mcl")
    yield* inTx((sql) =>
      sql`insert into model_calls (id, workspace_id, member_id, principal_kind, purpose, prompt_id, prompt_version,
                                   provider, model, input_tokens, output_tokens, cached_tokens, cache_write_tokens,
                                   cost_micros, latency_ms, outcome, error, subject_type, subject_id, test)
          values (${callId}, app_workspace_id(), ${caller.memberId}, ${caller.principalKind}, ${prompt.purpose},
                  ${prompt.id}, ${prompt.version}, ${model.provider}, ${model.model}, ${tokens.input},
                  ${tokens.output}, ${tokens.cacheRead}, ${tokens.cacheWrite}, ${costOf(model.price, tokens)},
                  ${latencyMs}, ${outcome}, ${said},
                  ${caller.subject?.type ?? null}, ${caller.subject?.id ?? null}, ${caller.test ?? false})`
    )
    if (Exit.isFailure(exit) || blocked) {
      yield* Effect.logWarning("a model call did not answer", { prompt: prompt.id, outcome })
      return yield* new ModelUnavailable({
        reason: outcome === "refused" ? "refused" : outcome === "guardrail_blocked" ? "blocked" : "failed"
      })
    }
    return { value: exit.value.value as O, callId, model } satisfies Called<O>
  }).pipe(Effect.withSpan("Ai.call", { attributes: { prompt: prompt.id, purpose: prompt.purpose } }))

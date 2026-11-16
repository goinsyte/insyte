import { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { LanguageModel } from "effect/ai"
import { SqlError } from "effect/sql"
import type { AskStep, StepInput } from "../ask/domain/Steps.ts"
import {
  AiModel,
  type BudgetExceeded,
  type Draft,
  type DraftSubject,
  type KnowledgeAnswer,
  type KnowledgeAnswerInput,
  type LatestDraft,
  type ModelUnavailable,
  type ReplyInput,
  type ThreadSummary,
  type TicketSummary
} from "./domain/Ai.ts"
import { askPrompt } from "./prompts/ask.ts"
import { type CustomerAgentContext, type CustomerAgentOutput, customerAgentPrompt } from "./prompts/customer-agent.ts"
import * as Background from "./use-cases/background.ts"
import * as Call from "./use-cases/call.ts"
import * as Drafts from "./use-cases/drafts.ts"

export type { Caller, InTx } from "./use-cases/call.ts"

/*
 * Insyte AI for the console (M15 steps 1 and 2; ADR-0015, ADR-0027): reply drafts and their rewrites, summaries, the
 * knowledge base's first text. Every call is budgeted and metered (`use-cases/call.ts`); nothing here sends anything.
 * The model is the caller's (`LanguageModel` with its `AiModel`): the Anthropic adapter through AI Gateway, the fake,
 * or none. This module and `effect/ai` are loaded only by what uses them (the API Worker imports it per call), so a
 * Worker starts without them and a failure to load them fails only an AI call.
 */

type R = Db | CurrentPrincipal
type Model = BudgetExceeded | ModelUnavailable

export interface DraftsApi {
  readonly reply: (input: ReplyInput) => Effect.Effect<Draft, Forbidden | NotFound | Invalid | Model, R>
  readonly use: (id: string) => Effect.Effect<Draft, Forbidden | NotFound, R>
  readonly forSubject: (subject: DraftSubject) => Effect.Effect<LatestDraft, Forbidden | NotFound, R>
  readonly summarizeTicket: (ticketId: string) => Effect.Effect<TicketSummary, Forbidden | NotFound | Model, R>
  readonly summarizeThread: (threadId: string) => Effect.Effect<ThreadSummary, Forbidden | NotFound | Model, R>
  readonly knowledgeAnswer: (
    input: KnowledgeAnswerInput
  ) => Effect.Effect<KnowledgeAnswer, Forbidden | NotFound | Invalid | Model, R>
}

/** The drafts over the model in context. */
export const drafts: Effect.Effect<DraftsApi, never, AiModel | LanguageModel.LanguageModel> = Effect.gen(function*() {
  const info = yield* AiModel
  const model = yield* LanguageModel.LanguageModel
  const withModel = <A, E, X>(effect: Effect.Effect<A, E, X>) =>
    effect.pipe(
      Effect.provideService(AiModel, info),
      Effect.provideService(LanguageModel.LanguageModel, model)
    )
  return {
    reply: (input) =>
      withModel(Effect.flatMap(Effect.service(Db), (db) => Drafts.reply(db.scoped, input))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    use: (id) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Drafts.use(sql, id))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    forSubject: (subject) =>
      withModel(Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Drafts.latest(sql, subject)))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    summarizeTicket: (ticketId) =>
      withModel(Effect.flatMap(Effect.service(Db), (db) => Drafts.summarizeTicket(db.scoped, ticketId))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    summarizeThread: (threadId) =>
      withModel(Effect.flatMap(Effect.service(Db), (db) => Drafts.summarizeThread(db.scoped, threadId))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    knowledgeAnswer: (input) =>
      withModel(Effect.flatMap(Effect.service(Db), (db) => Drafts.knowledgeAnswer(db.scoped, input))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
  } satisfies DraftsApi
})

type BackgroundR = Db | CurrentWorkspace | AiModel | LanguageModel.LanguageModel

/** A ticket's topic by the model, from its own queue message (`ticket.topic_requested`); the rules' otherwise. */
export const classifyTicket = (
  ticketId: string
): Effect.Effect<"skipped" | "kept" | "classified", never, BackgroundR> =>
  Background.classifyTicket(ticketId).pipe(
    Effect.catchIf(SqlError.isSqlError, Effect.die)
  )

/** The `EvidencePackWorkflow`'s `narrative` step: the pack's account by the model, or the facts' sentences. */
export const writeNarrative = (
  chargebackId: string,
  runId: string
): Effect.Effect<"skipped" | "kept" | "written", SqlError.SqlError, BackgroundR> =>
  Background.writeNarrative(chargebackId, runId)

/**
 * One step of Vraag Insyte's loop (M15 step 3): reserved against the month's budget before the model is asked, metered
 * in `model_calls` whatever the outcome. The loop itself is the `ask` slice's.
 */
export const askStep = <X>(
  inTx: Call.InTx<X>,
  caller: Call.Caller,
  input: StepInput
): Effect.Effect<
  Call.Called<AskStep>,
  BudgetExceeded | ModelUnavailable | SqlError.SqlError,
  X | AiModel | LanguageModel.LanguageModel
> => Call.call(inTx, caller, askPrompt, input)

/** The prompt's `id@version`, as an answer keeps it. */
export const ASK_PROMPT_VERSION = `${askPrompt.id}@${askPrompt.version}`

/**
 * The customer agent's answer on the website chat (M15 step 8): reserved against the month's budget, metered in
 * `model_calls` whatever the outcome. What becomes of it is the `channel-agent` slice's; nothing here sends it.
 */
export const customerAgentStep = <X>(
  inTx: Call.InTx<X>,
  caller: Call.Caller,
  input: CustomerAgentContext
): Effect.Effect<
  Call.Called<CustomerAgentOutput>,
  BudgetExceeded | ModelUnavailable | SqlError.SqlError,
  X | AiModel | LanguageModel.LanguageModel
> => Call.call(inTx, caller, customerAgentPrompt, input)

export type { CustomerAgentContext, CustomerAgentOutput } from "./prompts/customer-agent.ts"
export { CUSTOMER_AGENT_PROMPT_VERSION } from "./prompts/customer-agent.ts"

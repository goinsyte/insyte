import { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { LanguageModel } from "effect/ai"
import { SqlError } from "effect/sql"
import {
  AiModel,
  type BudgetExceeded,
  type Draft,
  type DraftSubject,
  type KnowledgeAnswer,
  type LatestDraft,
  type ModelUnavailable,
  type ReplyInput,
  type ThreadSummary,
  type TicketSummary
} from "./domain/Ai.ts"
import * as Background from "./use-cases/background.ts"
import * as Drafts from "./use-cases/drafts.ts"

/*
 * Insyte AI for the console (M15 steps 1 and 2; ADR-0015, ADR-0027): reply drafts and their rewrites, summaries, the
 * knowledge base's first text. Every call is budgeted and metered (`use-cases/call.ts`); nothing here sends anything.
 * The model is the layer's (`LanguageModel` with its `AiModel`): the Anthropic adapter through AI Gateway, or the fake.
 */

type R = Db | CurrentPrincipal
type Model = BudgetExceeded | ModelUnavailable

/** @effect-expect-leaking Db CurrentPrincipal */
export class DraftsService extends Context.Service<DraftsService, {
  readonly reply: (input: ReplyInput) => Effect.Effect<Draft, Forbidden | NotFound | Invalid | Model, R>
  readonly use: (id: string) => Effect.Effect<Draft, Forbidden | NotFound, R>
  readonly forSubject: (subject: DraftSubject) => Effect.Effect<LatestDraft, Forbidden | NotFound, R>
  readonly summarizeTicket: (ticketId: string) => Effect.Effect<TicketSummary, Forbidden | NotFound | Model, R>
  readonly summarizeThread: (threadId: string) => Effect.Effect<ThreadSummary, Forbidden | NotFound | Model, R>
  readonly knowledgeAnswer: Effect.Effect<KnowledgeAnswer, Forbidden, R>
}>()("modules/DraftsService") {
  static readonly layer = Layer.effect(
    DraftsService,
    Effect.gen(function*() {
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
          Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Drafts.latest(sql, subject))).pipe(
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
        knowledgeAnswer: Drafts.knowledgeAnswer()
      }
    })
  )
}

type BackgroundR = Db | CurrentWorkspace | AiModel | LanguageModel.LanguageModel

/** A ticket's topic by the model, after it was saved (the relay's `ticket.topic_requested`); the rules' otherwise. */
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

export { AiModel } from "./domain/Ai.ts"

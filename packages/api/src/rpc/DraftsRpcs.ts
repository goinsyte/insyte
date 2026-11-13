import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AiRateLimited,
  BudgetExceeded,
  Draft,
  DraftIdInput,
  KnowledgeAnswer,
  KnowledgeAnswerInput,
  LatestDraft,
  ModelUnavailable,
  ReplyInput,
  SubjectInput,
  ThreadIdInput,
  ThreadSummary,
  TicketIdInput,
  TicketSummary
} from "@insyte/modules/ai/domain/Ai"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Insyte AI's drafts and summaries (M15 step 2; ADR-0027): a reply to a thread or a ticket and its Warmer and Korter,
 * the draft taken into the composer, the latest one still current, a ticket's or a thread's summary, and the knowledge
 * base's first text. Insyte writes; a person sends. A spent budget (`BudgetExceeded`), too many calls at once
 * (`AiRateLimited`) and a model that did not answer or is not set up (`ModelUnavailable`) are said in Dutch where they
 * land.
 */
export class DraftsRpcs extends RpcGroup.make(
  Rpc.make("Drafts.reply", {
    payload: ReplyInput,
    success: Draft,
    error: Schema.Union([Forbidden, NotFound, Invalid, BudgetExceeded, AiRateLimited, ModelUnavailable])
  }),
  Rpc.make("Drafts.use", {
    payload: DraftIdInput,
    success: Draft,
    error: Schema.Union([Forbidden, NotFound, ModelUnavailable])
  }),
  Rpc.make("Drafts.forSubject", {
    payload: SubjectInput,
    success: LatestDraft,
    error: Schema.Union([Forbidden, NotFound, ModelUnavailable])
  }),
  Rpc.make("Drafts.summarizeTicket", {
    payload: TicketIdInput,
    success: TicketSummary,
    error: Schema.Union([Forbidden, NotFound, BudgetExceeded, AiRateLimited, ModelUnavailable])
  }),
  Rpc.make("Drafts.summarizeThread", {
    payload: ThreadIdInput,
    success: ThreadSummary,
    error: Schema.Union([Forbidden, NotFound, BudgetExceeded, AiRateLimited, ModelUnavailable])
  }),
  Rpc.make("Drafts.knowledgeAnswer", {
    payload: KnowledgeAnswerInput,
    success: KnowledgeAnswer,
    error: Schema.Union([Forbidden, ModelUnavailable])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

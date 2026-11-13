import { Context, Schema } from "effect"

/*
 * Insyte AI's platform (M15 step 1; ADR-0015, ai.md §3, §7, §8): what a model is to the slices. The model itself is
 * `effect/ai`'s `LanguageModel` (and `EmbeddingModel` for the knowledge base, later); beside it, `AiModel` says which
 * one is behind it and what it costs, so every call can be metered (`model_calls`) and budgeted (`ai_budgets`). The
 * Anthropic adapter goes through Cloudflare AI Gateway; without its keys a deterministic fake answers, so tests,
 * local runs and previews never call a model. Errors carry tags and fields; the console says them in Dutch.
 */

/** What a call was for (`model_calls.purpose`). */
export const PURPOSES = [
  "plate",
  "draft",
  "ask",
  "finding_text",
  "automation_from_sentence",
  "classify",
  "summarize",
  "evidence_narrative",
  "weekly_report",
  "agent",
  "channel_agent",
  "embedding",
  "knowledge_answer"
] as const
export type Purpose = (typeof PURPOSES)[number]

/** How hard the model thinks: `low` for drafts, summaries and classification; `medium` for Ask (ai.md §3). */
export type Effort = "low" | "medium"

/** US dollars per million tokens, as the provider prices them; a call's cost in dollar micros is tokens × this. */
export interface Price {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export interface ModelInfo {
  /** `fake` answers from each prompt's own template: nothing is sent anywhere, nothing costs anything. */
  readonly provider: "anthropic" | "fake"
  readonly model: string
  readonly price: Price
  /**
   * Whether Insyte may write here at all. The fake is ready only where it is asked for by name (`AI_ADAPTER=fake`: the
   * worker tests, local runs); a deployed stage without its keys has no model, and nobody is shown a template's text
   * as Insyte's draft.
   */
  readonly ready: boolean
}

/** Tokens as the provider bills them. */
export interface Tokens {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/**
 * What the adapter saw of one call, for the meter whatever the outcome: whether the request went out, whether the
 * provider turned it away before running it (an HTTP error: not billed), and the usage it reported. A provider bills
 * an answer that fails to decode, one cut off at the limit and a refusal too: the usage is kept before the answer is
 * read.
 */
export interface Meter {
  sent: boolean
  rejected: boolean
  usage: Tokens | undefined
}

/** Which model is behind `LanguageModel`, and its price. Chosen by configuration where the app is composed. */
export class AiModel extends Context.Service<AiModel, ModelInfo>()("ai/AiModel") {}

/**
 * The settings of the call being made, read by the adapter: the prompt it is, the effort and the length it may take,
 * and the fake's answer for this prompt and input (only the fake reads it).
 */
export interface CallSettings {
  readonly promptId: string
  readonly effort: Effort
  readonly maxTokens: number
  readonly fake: (() => unknown) | undefined
  readonly meter: Meter | undefined
}

export const CallSettings = Context.Reference<CallSettings>("ai/CallSettings", {
  defaultValue: () => ({ promptId: "unknown", effort: "low", maxTokens: 16_000, fake: undefined, meter: undefined })
})

/* ── errors ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The month's AI budget is spent: the workspace's, or the person's own (Limieten). `limit` and `used` are euros. No
 * model was called.
 */
export class BudgetExceeded extends Schema.TaggedError<BudgetExceeded>()("BudgetExceeded", {
  scope: Schema.Literals(["workspace", "member"]),
  limit: Schema.Int,
  used: Schema.Finite
}) {}

/**
 * The model did not answer usefully: it declined (`refused`), it or the gateway failed (`failed`), or its answer did
 * not pass the checks (`blocked`: a figure the record does not have). Or it was not asked: the stage has no model
 * (`unconfigured`), or the same draft is being written already (`busy`).
 */
export class ModelUnavailable extends Schema.TaggedError<ModelUnavailable>()("ModelUnavailable", {
  reason: Schema.Literals(["refused", "failed", "blocked", "unconfigured", "busy"])
}) {}

/** Too many calls in a short time, the person's own or the workspace's: asked again after `retryAfterSeconds`. */
export class AiRateLimited extends Schema.TaggedError<AiRateLimited>()("AiRateLimited", {
  retryAfterSeconds: Schema.Int
}) {}

/* ── drafts ───────────────────────────────────────────────────────────────────────────────────────────────────── */

export const DraftSubject = Schema.Struct({
  type: Schema.Literals(["thread", "ticket"]),
  id: Schema.String
})
export type DraftSubject = typeof DraftSubject.Type

export const Tone = Schema.Literals(["warmer", "korter"])

/** One draft as the inbox card and the ticket's composer show it. */
export class Draft extends Schema.Class<Draft>("ai/Draft")({
  id: Schema.String,
  subject: DraftSubject,
  kind: Schema.Literals(["reply", "summary", "knowledge_answer"]),
  text: Schema.String,
  /** `null` is the first draft; `warmer` and `korter` are its rewrites. */
  tone: Schema.NullOr(Tone),
  parentDraftId: Schema.NullOr(Schema.String),
  usedAt: Schema.NullOr(Schema.Finite),
  createdAt: Schema.Finite,
  /** What wrote it, for "prompt {versie}" and for a fake's text to say it is one. */
  provider: Schema.Literals(["anthropic", "fake"]),
  model: Schema.String,
  promptVersion: Schema.String
}) {}

export const ReplyInput = Schema.Struct({
  subject: DraftSubject,
  /** A rewrite of `parentDraftId`: Warmer maken, Korter maken. */
  tone: Schema.optional(Tone),
  parentDraftId: Schema.optional(Schema.String)
})
export type ReplyInput = typeof ReplyInput.Type

export const SubjectInput = Schema.Struct({ subject: DraftSubject })

export const DraftIdInput = Schema.Struct({ id: Schema.String })

export const TicketIdInput = Schema.Struct({ ticketId: Schema.String })

export const ThreadIdInput = Schema.Struct({ threadId: Schema.String })

/** The thread's or the ticket's latest reply draft, when it is still about the last thing the customer wrote. */
/**
 * Whether Insyte AI is switched on for this stage: a model is set up (or the local fake asked for by name). Off, the
 * console says so where drafts and summaries would be, and no call is made.
 */
export class AiStatus extends Schema.Class<AiStatus>("ai/AiStatus")({
  enabled: Schema.Boolean
}) {}

export class LatestDraft extends Schema.Class<LatestDraft>("ai/LatestDraft")({
  draft: Schema.NullOr(Draft),
  /** Whether a new one may be asked for here: the role may, there is something to answer, and a model is ready. */
  canDraft: Schema.Boolean
}) {}

/** A ticket's summary, written into its activity as Insyte's line. */
export class TicketSummary extends Schema.Class<TicketSummary>("ai/TicketSummary")({
  commentId: Schema.String,
  text: Schema.String
}) {}

/** A thread's summary, kept as a draft of its own. */
export class ThreadSummary extends Schema.Class<ThreadSummary>("ai/ThreadSummary")({
  draftId: Schema.String,
  text: Schema.String
}) {}

export const KnowledgeAnswerInput = Schema.Struct({
  gapId: Schema.optional(Schema.String),
  articleId: Schema.optional(Schema.String)
})

/**
 * "Laat Insyte een eerste tekst schrijven": a first text, or nothing yet. Until the knowledge base exists there is
 * nothing to write from (`no_knowledge`), and Insyte says so instead of inventing an answer.
 */
export const KnowledgeAnswer = Schema.Union([
  Schema.TaggedStruct("Written", { draft: Draft }),
  Schema.TaggedStruct("Nothing", { reason: Schema.Literals(["no_knowledge"]) })
])
export type KnowledgeAnswer = typeof KnowledgeAnswer.Type

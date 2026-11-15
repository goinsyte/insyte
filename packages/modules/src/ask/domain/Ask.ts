import { Schema } from "effect"
import { ExplainRef } from "../../analytics/domain/Analytics.ts"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Vraag Insyte (M15 step 3; widgets/02 Part D, api.md §2.12, ai.md §4): a person's conversations with Insyte. A question
 * is answered by the model over read-only tools that run as the person asking, so an answer never holds more than the
 * person could open in the console. The answer streams as frames (`AskFrame`) in the order the console plays a turn:
 * think, the tools and what they read, the words, settled. Every number in an answer is a figure a tool computed,
 * carried with where it can be checked (`explain`, or the list `to` that holds its rows); the model only places it.
 * Times are epoch milliseconds.
 */

/** What a record chip opens, by the icon the thread gives it. */
export const RefKind = Schema.Literals(["order", "chargeback", "ticket", "customer", "supplier", "store", "return"])
export type RefKind = typeof RefKind.Type

/** A word (or the space after it). */
export const WordToken = Schema.Struct({ t: Schema.String })

/** A record named in the answer, as a chip that opens it. */
export const RefToken = Schema.Struct({ ref: Schema.String, to: Schema.String, kind: RefKind })

/**
 * A figure in the answer, as a tool computed it: what it says (`figure`, "€ 1.240,00"), what it is (`label`), and
 * where it can be checked. `explain` opens Analyse's explanation of it (the rows it sums); without one, `to` is the
 * list that holds its rows.
 */
export const FigureToken = Schema.Struct({
  figure: Schema.String,
  label: Schema.String,
  to: Schema.String,
  explain: Schema.NullOr(ExplainRef)
})

export const Token = Schema.Union([WordToken, RefToken, FigureToken])
export type Token = typeof Token.Type

/** A tool the answer ran, as its chip says it: "Las" "12 wachtrijregels". */
export const ToolChip = Schema.Struct({ verb: Schema.String, object: Schema.String })
export type ToolChip = typeof ToolChip.Type

/** What an answer read, for "{n} bronnen gelezen" and "Wat Insyte las". */
export const Source = Schema.Struct({
  kind: Schema.Literals(["order", "chargeback", "ticket", "customer", "supplier", "store", "return", "queue"]),
  title: Schema.String,
  detail: Schema.String,
  to: Schema.String
})
export type Source = typeof Source.Type

/**
 * How long one answer may take, all its steps and tools together (each step's model call is up to 45 s): past it the
 * turn is stopped and kept as `interrupted`. An answer still `streaming` after `STALE_MS` was left behind by a Worker
 * that went away: it is read as failed, its thread takes a question again, and an `Idempotency-Key` held by it is free.
 * The one is shorter than the other, so a thread whose answer still runs never takes a second question.
 */
export const TURN_MS = 165_000
export const STALE_MS = 180_000

/**
 * Why an answer did not come: the month's AI budget is spent (`budget`), the model did not answer or its answer did not
 * pass the figure check twice (`model`), too many questions in a minute (`rate`), or the turn was left before it
 * settled (`interrupted`). A turn that ran into its tool or time limit settles with what it found (`limit` is then only
 * a note on a settled turn).
 */
export const TurnFailure = Schema.Literals(["budget", "model", "limit", "interrupted", "rate"])
export type TurnFailure = typeof TurnFailure.Type

export const TurnState = Schema.Literals(["streaming", "settled", "failed"])
export type TurnState = typeof TurnState.Type

/** One turn as the thread draws it: the person's question, or Insyte's answer. */
export class AskTurn extends Schema.Class<AskTurn>("ask/AskTurn")({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  state: TurnState,
  /** The question; for an answer, its words as plain text (for "Antwoord kopiëren"). */
  text: Schema.String,
  tokens: Schema.Array(Token),
  tools: Schema.Array(ToolChip),
  sources: Schema.Array(Source),
  followUps: Schema.Array(Schema.String),
  /** The thinking steps, one line each, and how long they took. */
  thinking: Schema.Array(Schema.String),
  thinkingMs: Schema.NullOr(Schema.Int),
  failure: Schema.NullOr(TurnFailure),
  /**
   * The answer read from a store the reader no longer reaches: its words, records and sources are not given back, only
   * that it was there.
   */
  withheld: Schema.Boolean,
  createdAt: Schema.Finite
}) {}

/** A conversation in the list ("Gesprekken"). */
export class AskThreadRow extends Schema.Class<AskThreadRow>("ask/AskThreadRow")({
  id: Schema.String,
  title: Schema.String,
  lastTurnAt: Schema.Finite
}) {}

export class AskThreadList extends Schema.Class<AskThreadList>("ask/AskThreadList")({
  rows: Schema.Array(AskThreadRow)
}) {}

/** One conversation with its turns, in order. */
export class AskThread extends Schema.Class<AskThread>("ask/AskThread")({
  id: Schema.String,
  title: Schema.String,
  lastTurnAt: Schema.Finite,
  turns: Schema.Array(AskTurn)
}) {}

/* ── inputs ───────────────────────────────────────────────────────────────────────────────────── */

const Question = Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(4000))

/** Where the person asked from: the page (for "Ziet Bestellingen…"), the store in view, the records on screen. */
export const AskContext = Schema.Struct({
  route: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  storeId: Schema.optional(Schema.String.check(Schema.isMaxLength(64))),
  refs: Schema.optional(Schema.Array(Schema.String.check(Schema.isMaxLength(64))).check(Schema.isMaxLength(20)))
})
export type AskContext = typeof AskContext.Type

/** `threadId` absent: a new conversation, titled by the question. */
export const SendInput = Schema.Struct({
  threadId: Schema.optional(Schema.String),
  text: Question,
  context: Schema.optional(AskContext)
})
export type SendInput = typeof SendInput.Type

/** "Opnieuw vragen": the same question again, as a new answer. */
export const RetryInput = Schema.Struct({ turnId: Schema.String })

export const ThreadIdInput = Schema.Struct({ id: Schema.String })

export const ListInput = Schema.Struct({
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
})

/** A conversation set aside, with the Undo that puts it back. */
export class AskRemoved extends Schema.Class<AskRemoved>("ask/AskRemoved")({
  id: Schema.String,
  undo: UndoTicket
}) {}

/** For `Shared.undo` (`ask.restore`): the conversation to put back. */
export const AskRestore = Schema.Struct({ id: Schema.String })

/* ── the stream ───────────────────────────────────────────────────────────────────────────────── */

/**
 * The frames of one answer (api.md §2.12), in order: `started` (the ids the console keys the turn by), then `thinking`
 * steps with the `tool`s run and the `source`s read, then the words as `text` frames, then `settled` with the turn as
 * it is kept (its state `settled` or `failed`).
 */
export const AskFrame = Schema.Union([
  Schema.TaggedStruct("started", {
    threadId: Schema.String,
    title: Schema.String,
    question: AskTurn,
    turnId: Schema.String
  }),
  Schema.TaggedStruct("thinking", { step: Schema.String, at: Schema.Finite }),
  Schema.TaggedStruct("tool", { tool: ToolChip }),
  Schema.TaggedStruct("source", { source: Source }),
  Schema.TaggedStruct("text", { tokens: Schema.Array(Token) }),
  Schema.TaggedStruct("settled", { turn: AskTurn })
])
export type AskFrame = typeof AskFrame.Type

/* ── errors ───────────────────────────────────────────────────────────────────────────────────── */

/** The conversation is answering a question already: one turn at a time. */
export class AskBusy extends Schema.TaggedError<AskBusy>()("AskBusy", { threadId: Schema.String }) {}

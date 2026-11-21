import { Schema } from "effect"
import { ToolCall } from "./Tools.ts"

/*
 * One step of Vraag Insyte's loop (ai.md §4), as the model is asked for it: a progress label for the screen (`status`),
 * the tools it wants run, or its answer. Not `thought`: asked for its thought, a model that thinks reads the request as
 * extracting its reasoning, and Anthropic refuses the call (`reasoning_extraction`). The answer is parts: words, and figures and records by the id a tool result gave them, so a
 * number in an answer is always one a tool computed (ai.md §6.2). A step either calls tools or answers.
 */

export const AnswerPart = Schema.Struct({
  kind: Schema.Literals(["text", "figure", "record"]),
  /** The words, or the id of a figure (`f1`) or a record (`r1`). */
  value: Schema.String
})
export type AnswerPart = typeof AnswerPart.Type

export const AskStep = Schema.Struct({
  status: Schema.String,
  calls: Schema.Array(ToolCall),
  answer: Schema.NullOr(Schema.Struct({
    parts: Schema.Array(AnswerPart),
    followUps: Schema.Array(Schema.String)
  }))
})
export type AskStep = typeof AskStep.Type

/** A tool's answer as the model reads it, rendered by the loop. */
export interface StepResult {
  readonly tool: string
  readonly text: string
}

/** Everything one step is asked with. */
export interface StepInput {
  readonly today: string
  /** The page the person asked from, as the composer names it ("Bestellingen"); null when none. */
  readonly page: string | null
  readonly question: string
  /** The conversation so far: each question and the answer's words, oldest first, at most the last few. */
  readonly history: ReadonlyArray<{ readonly question: string; readonly answer: string }>
  readonly tools: ReadonlyArray<{ readonly name: string; readonly description: string }>
  readonly results: ReadonlyArray<StepResult>
  /** The figures and records the results gave, by id: what the answer may place. */
  readonly figures: ReadonlyArray<{ readonly id: string; readonly label: string; readonly display: string }>
  readonly records: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly label: string }>
  /** No more tools: answer with what was found. */
  readonly final: boolean
  /** The last answer did not pass the figure check: what was wrong with it. */
  readonly correction: string | null
}

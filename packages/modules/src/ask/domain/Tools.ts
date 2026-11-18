import type { Effect } from "effect"
import { Schema } from "effect"
import type { ExplainRef } from "../../analytics/domain/Analytics.ts"
import type { RefKind, Source, ToolChip } from "./Ask.ts"

/*
 * Vraag Insyte's tools (ai.md §4): read-only views of the use cases the console calls, run as the person asking, so
 * each answers only what that person's role and stores may open, and one their role may not open answers that it may
 * not, never an error. A tool computes every number it hands over (`figures`) and names every record it read
 * (`records`); the model places them by id and writes the words around them. What came from outside Insyte's own
 * columns (a customer's words, a product's title, a ticket's subject) goes to the model inside a data block
 * (`dataBlock`), as data it reads and never obeys.
 *
 * Each slice that has something to tell adds a list of tools (`AskToolSet`) where the app is composed; the agent reads
 * them all. Knowledge search joins the same way when the knowledge base lands.
 */

/** A number a tool computed, as the answer says it, and where it can be checked. */
export interface ToolFigure {
  /** What the number is, in Dutch: "Vertraagde bestellingen". */
  readonly label: string
  /** As the answer shows it: "3", "€ 1.240,00", "92%". */
  readonly display: string
  /** The list that holds its rows. */
  readonly to: string
  /** Analyse's explanation of it, where there is one. */
  readonly explain: ExplainRef | null
}

/** A record a tool read, as a chip in the answer. */
export interface ToolRecord {
  readonly id: string
  readonly kind: RefKind
  /** The chip's text: "#1002", "TKT-0901", "DSP-2214". */
  readonly label: string
  readonly to: string
  /** What the model may know of it, one line, written by the tool (customer text inside data blocks). */
  readonly facts: string
  readonly storeId: string | null
}

/** One tool's answer. */
export interface ToolResult {
  readonly chip: ToolChip
  /** What the model reads besides the figures and records: a line or two; outside text inside data blocks. */
  readonly summary: string
  readonly figures: ReadonlyArray<ToolFigure>
  readonly records: ReadonlyArray<ToolRecord>
  readonly sources: ReadonlyArray<Source>
  /** The stores the rows it read belong to. */
  readonly storeIds: ReadonlyArray<string>
  /** It read every store the person reaches, whatever store the page is on (the month figures, a search). */
  readonly wide?: boolean | undefined
  /** The Kennisbank chapters it read: cited once the turn is answered, for their "gebruikt (7 d)". */
  readonly cited?: ReadonlyArray<{ readonly articleId: string; readonly version: number }> | undefined
}

/** Where the person asked from, as the tools narrow by it. */
export interface ToolContext {
  readonly storeId: string | undefined
}

/** A tool, as the model is told of it and as the loop runs it. */
export interface AskTool<R = never> {
  readonly name: string
  /** For the model, in English: what it reads, and its input as JSON. */
  readonly description: string
  /** The thinking line while it runs, in Dutch: "Ik lees de wachtrij". */
  readonly step: string
  readonly run: (input: Readonly<Record<string, unknown>>, context: ToolContext) => Effect.Effect<ToolResult, never, R>
}

/** One slice's tools. */
export type AskToolSet<R = never> = ReadonlyArray<AskTool<R>>

/** A tool's input read loosely: the model writes JSON, and a field it got wrong is a field left out. */
export const field = {
  string: (input: Readonly<Record<string, unknown>>, key: string, max = 200): string | undefined => {
    const v = input[key]
    return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : undefined
  },
  boolean: (input: Readonly<Record<string, unknown>>, key: string): boolean | undefined => {
    const v = input[key]
    return typeof v === "boolean" ? v : undefined
  },
  oneOf: <const L extends string>(
    input: Readonly<Record<string, unknown>>,
    key: string,
    literals: ReadonlyArray<L>
  ): L | undefined => {
    const v = input[key]
    return typeof v === "string" && (literals as ReadonlyArray<string>).includes(v) ? (v as L) : undefined
  }
}

/** A tool call as the model wrote it: the tool's name and its input as JSON text. */
export const ToolCall = Schema.Struct({ tool: Schema.String, input: Schema.String })
export type ToolCall = typeof ToolCall.Type

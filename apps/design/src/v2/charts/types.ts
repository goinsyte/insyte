import type { Better, Format } from "./format.ts"

/**
 * The data shapes the chart system draws. Five forms and no more: figures, line, bar (upright or
 * ranked on its side), funnel and table. Every one takes the same three ideas:
 *
 * - `current` is drawn in ink and `compare` (the period before) in comparison grey;
 * - `focus` names the ONE item the chart is about, drawn in the accent;
 * - a `Note` is something Magnus found, pinned to an item and marked with the AI gradient.
 *
 * There is no colour option. That is the standard: whatever lands on a board, it reads as one system.
 */

export type Note = {
  /** One sentence, Magnus's voice: the figure and what moved it. */
  readonly text: string
  /** Which item it is pinned to (index into labels / items / steps). */
  readonly at: number
}

export type Figure = {
  readonly label: string
  readonly value: number
  readonly previous: number
  readonly format: Format
  readonly better: Better
}

export type LineData = {
  readonly labels: ReadonlyArray<string>
  readonly current: ReadonlyArray<number>
  readonly compare?: ReadonlyArray<number>
  readonly format: Format
  readonly focus?: number
}

type BarItem = { readonly label: string; readonly value: number; readonly compare?: number }

export type BarData = {
  readonly items: ReadonlyArray<BarItem>
  readonly format: Format
  readonly focus?: number
  /** A line the bars are held against: a promise, a target. */
  readonly reference?: { readonly value: number; readonly label: string }
}

export type FunnelData = {
  readonly steps: ReadonlyArray<{ readonly label: string; readonly value: number }>
}

type Column = {
  readonly key: string
  readonly label: string
  readonly format?: Format
  /** Draw a share bar under the figure, scaled to the column's largest value. */
  readonly bar?: boolean
  /** A column holding a change against `previousKey`, judged by `better`. */
  readonly previousKey?: string
  readonly better?: Better
}

export type TableData = {
  readonly columns: ReadonlyArray<Column>
  readonly rows: ReadonlyArray<Readonly<Record<string, string | number>>>
  /** The row the table is about, by index. */
  readonly focus?: number
}

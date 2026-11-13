import { createContext, useContext } from "react"

/**
 * What Kosten (`/costs`) reads and does, from whoever hosts it (as `suppliers/source.tsx` is for Leveranciers): the
 * design app from its costs store and the analytics history, the console from `Costs.list` and its commands (M13 step
 * 5). Amounts are in the workspace's currency, in whole units. What the host cannot do yet is said, never made up: an
 * ad account it cannot connect reads nothing and its months are typed.
 */

export type CostKind = "fixed" | "per_order" | "percent" | "ads"
export type CostSource = "manual" | "meta" | "google-ads"

/** One month of a line: what it costs, and whether someone typed it. */
export interface CostCell {
  amount: number
  typed: boolean
}

export interface CostRow {
  id: string
  name: string
  kind: CostKind
  /** Percent: the share of revenue, 0–100; per order: the amount; else 0. */
  rate: number
  source: CostSource
  /** An ad line whose account is connected: its untyped months are what the account reports. */
  reads: boolean
  /** Whether any month was typed ("Weer uit … lezen"). */
  hasTyped: boolean
  /** Per month id of `months`. */
  cells: Readonly<Record<string, CostCell>>
}

export interface CostMonth {
  /** `YYYY-MM`. */
  id: string
  /** "mei". */
  abbr: string
  /** "Mei". */
  name: string
}

export interface CostFigures {
  revenue: number
  orders: number
  ads: number
  other: number
  costs: number
  net: number
  margin: number
  roas: number
}

/** "Kostenpost toevoegen": the dialog's fields, numbers parsed. */
export interface NewCostLine {
  name: string
  kind: CostKind
  rate: number
  /** Fixed or ads: typed into every month shown; `null` leaves them empty. */
  amountPerMonth: number | null
}

/** What a change says once done, with its Undo. */
export interface Said {
  label: string
  detail?: string | undefined
}

export interface CostsSource {
  lines: ReadonlyArray<CostRow>
  /** Oldest first. */
  months: ReadonlyArray<CostMonth>
  /** The month under way, marked "loopt"; `null` when the range ends before it. */
  running: string | null
  /** Per month id. */
  figures: Readonly<Record<string, CostFigures>>
  /** ISO code, every amount's. */
  currency: string
  /** The header's "januari tot mei 2026". */
  rangeLabel: string
  /** Kosten bewerken: when not, what the role misses, for the disabled "Kostenpost". */
  edit: { ok: boolean; reason: string }
  /** The sheet "Winst per maand" opens; absent where the host has no sheets yet. */
  profitSheet?: string | undefined
  /**
   * Connecting an ad account: a path to the integrations screen, or a step the host takes (the console says it cannot
   * yet). Absent, there is nowhere to connect.
   */
  connect?: { to: string } | { run: (source: CostSource) => void } | undefined
  /** Each change resolves whether it took: a dialog that did not keeps what was typed. */
  add: (line: NewCostLine, said: Said) => Promise<boolean>
  update: (row: CostRow, patch: { name: string; kind: CostKind; rate: number }, said: Said) => Promise<boolean>
  /** A month typed, or cleared with `null`. */
  setAmount: (row: CostRow, month: string, amount: number | null, said: Said) => void
  readFromSource: (row: CostRow, said: Said) => void
  remove: (row: CostRow, said: Said) => void
}

const Context = createContext<CostsSource | null>(null)

export const CostsSourceProvider = Context.Provider

export function useCostsSource(): CostsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("Kosten needs a CostsSourceProvider around it.")
  return source
}

import { createContext, type ReactNode, useContext } from "react"
import type { Crumb } from "../common/page-header"

/**
 * What the statements pages read and do, from whoever hosts them: the design app from the supplier's demo history
 * (`lib/supplier-statements.ts`), the console from `Suppliers.statements` and `Suppliers.statement` (M13 step 6), where
 * the brand reads what it owes one supplier. The markup is the design's; what a host has no figure for is left out.
 * Amounts are in the statement's currency, in whole units (cents as decimals), formatted by the host's `money`.
 */

export type StatementStatus = "paid" | "processing" | "open"

export const STATEMENT_STATUS: Record<StatementStatus, { label: string; tone: "success" | "info" | "warning" }> = {
  paid: { label: "Betaald", tone: "success" },
  processing: { label: "Wordt verwerkt", tone: "info" },
  open: { label: "Lopend", tone: "warning" }
}

/** One month, as the list and the page's figures show it. */
export type StatementView = {
  /** The month, `YYYY-MM`: also the row's id and its page's address. */
  id: string
  /** "Mei 2026". */
  label: string
  shippedLines: number
  shipped: number
  corrections: number
  total: number
  status: StatementStatus
  /** `YYYY-MM-DD`: when it was or will be paid. */
  payDay: string
}

/** One line of a month: a shipped line at cost, or a correction (negative) for a return that was their fault. */
export type StatementLineView = {
  id: string
  order: string
  /** `YYYY-MM-DD`. */
  day: string
  title: string
  qty: number
  /** `null` when it has no cost price, or no rate into the statement's currency (`missing`). */
  unit: number | null
  total: number
  kind: "shipped" | "correction"
  reason?: string | undefined
  /** Why it counts nothing yet. */
  missing?: "cost" | "rate" | undefined
}

export interface StatementsSource {
  /** The line beside the title. */
  meta: string
  crumbs?: ReadonlyArray<Crumb> | undefined
  rows: Array<StatementView>
  /** "Betaald dit jaar". */
  paidThisYear: number
  money: (amount: number) => string
  open: (row: StatementView) => void
  /** What the table says when there is no month yet; absent, the table's own line. */
  empty?: ReactNode
}

export interface StatementSource {
  statement: StatementView
  lines: Array<StatementLineView>
  crumbs: ReadonlyArray<Crumb>
  money: (amount: number) => string
  /** "Factuur downloaden"; absent while there is no invoice yet (the running month), with why. */
  download: { run: () => void } | { reason: string }
  /**
   * "Als betaald markeren", where the host pays it (the brand, not the supplier): offered on a closed month that is not
   * paid yet, disabled with why when the role may not.
   */
  pay?: { ok: boolean; reason: string; busy: boolean; run: () => void } | undefined
}

const StatementsSourceContext = createContext<StatementsSource | null>(null)
const StatementSourceContext = createContext<StatementSource | null>(null)

export const StatementsSourceProvider = StatementsSourceContext.Provider
export const StatementSourceProvider = StatementSourceContext.Provider

export function useStatementsSource(): StatementsSource {
  const source = useContext(StatementsSourceContext)
  if (source === null) throw new Error("The statements page needs a StatementsSourceProvider around it.")
  return source
}

export function useStatementSource(): StatementSource {
  const source = useContext(StatementSourceContext)
  if (source === null) throw new Error("A statement's page needs a StatementSourceProvider around it.")
  return source
}

import { parseTyped } from "./sheets.ts"

/** A month's cell in Kosten as the field reads it. */
export interface CellNow {
  readonly amount: number
  readonly typed: boolean
  /** Typed in another currency, with no rate to read it in: shown empty, and not the 0 it reads as. */
  readonly noRate?: boolean
}

/**
 * What leaving a month's field does with what is in it: nothing, clear the typed month, or type an amount. A month
 * with no rate shows empty, so leaving it empty (tabbing through the table) keeps what was typed in the other currency;
 * only an amount typed over it replaces it.
 */
export function cellCommit(draft: string, cell: CellNow | undefined): "keep" | "clear" | { readonly amount: number } {
  const t = draft.trim()
  const typed = cell?.typed ?? false
  const noRate = cell?.noRate === true
  if (t === "") return typed && !noRate ? "clear" : "keep"
  const n = parseTyped(t).value
  if (typeof n !== "number" || n < 0) return "keep"
  if (typed && !noRate && cell?.amount === n) return "keep"
  return { amount: n }
}

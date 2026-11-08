import type { SupplierOrderRow } from "../hooks/use-supplier-orders"

/** The supplier's order views, and which rows each holds (store-free, for the panel's counts). */
export type SupplierView = "to_accept" | "to_ship" | "late" | "problem" | "shipped" | "all"

export function inSupplierView(r: SupplierOrderRow, v: SupplierView): boolean {
  if (v === "all") return true
  if (v === "late") return (r.status === "to_accept" || r.status === "to_ship") && r.due === "late"
  return r.status === v
}

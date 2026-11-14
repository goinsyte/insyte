import { useMemo } from "react"
import { legKey } from "../lib/forwarding"
import {
  dueOf,
  handoffBy,
  linesOf,
  ME_SUPPLIER,
  statusOf,
  supplierAmount,
  type SupplierWork,
  workKey
} from "../lib/supplier-work"
import type { Order } from "../lib/types/domain"
import { legsNow, useForwarding } from "../stores/forwarding-store"
import { useWorkspace } from "../stores/workspace-store"
import type { SupplierOrderRow } from "../supplier/source"
import { useProducts } from "./use-operator-data"

export type { SupplierOrderRow } from "../supplier/source"

/** A demo row with the order and the supplier's work it was made from, for the order's page and its packing slip. */
export type DemoSupplierOrder = { row: SupplierOrderRow; order: Order; work: SupplierWork | undefined }

/** Every order with at least one of this supplier's lines, from the supplier's side, out of the demo stores. */
export function useDemoSupplierOrders(): Array<DemoSupplierOrder> {
  const orders = useWorkspace((s) => s.orders)
  const work = useWorkspace((s) => s.supplierWork)
  const overrides = useForwarding((s) => s.overrides)
  const { data: products } = useProducts()
  return useMemo(
    () => {
      // What the brand has not sent yet does not exist for the supplier (PLAN 24): a leg still to
      // forward, or taken elsewhere, is out; a leg the brand marked confirmed is work to ship.
      const legs = new Map(legsNow(overrides, work, Date.now()).map((l) => [legKey(l.orderId, l.supplierId), l]))
      return orders.flatMap((o) => {
        const lines = linesOf(o, ME_SUPPLIER.id)
        if (lines.length === 0) return []
        const leg = legs.get(legKey(o.id, ME_SUPPLIER.id))
        if (
          leg &&
          (leg.effective === "to_forward" || leg.effective === "sending" || leg.effective === "cancelled" ||
            leg.supplierId !== ME_SUPPLIER.id ||
            (leg.effective === "error" && leg.reason !== undefined && leg.by !== ME_SUPPLIER.name))
        ) return []
        const w = work[workKey(o.id, ME_SUPPLIER.id)]
        const status = statusOf(o, w)
        return [
          {
            order: o,
            work: w,
            row: {
              id: o.id,
              number: o.number,
              lines: lines.map((l) => ({
                id: l.id,
                productId: l.product_id,
                title: l.title,
                variantTitle: l.variant_title ?? null,
                sku: l.variant_id,
                quantity: l.quantity
              })),
              units: lines.reduce((n, l) => n + l.quantity, 0),
              status: status === "to_accept" && leg?.effective === "confirmed" ? "to_ship" : status,
              due: dueOf(o, w),
              handoff: handoffBy(o, w),
              amount: supplierAmount(lines, products),
              costMissing: false,
              city: o.shipping_address?.city ?? "",
              country: o.shipping_address?.country ?? ""
            }
          }
        ]
      })
    },
    [orders, work, products, overrides]
  )
}

/** The supplier's orders as its lists show them, each with its work (the demo's chat quotes a parcel from it). */
export function useSupplierOrders(): Array<SupplierOrderRow & { work: SupplierWork | undefined }> {
  const all = useDemoSupplierOrders()
  return useMemo(() => all.map((d) => ({ ...d.row, work: d.work })), [all])
}

/** The cuts the area panel and the list share. */
export { inSupplierView, type SupplierView } from "../lib/supplier-views"

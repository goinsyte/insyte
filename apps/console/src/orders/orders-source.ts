import type { OrderPage, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrdersSource } from "@insyte/ui/app/orders/source"
import { Copy, Download } from "@insyte/ui/icons"
import { useMemo } from "react"

/*
 * The orders list's source in the console (M6.4): `Orders.list`'s rows as the design's orders, the stores by name for
 * the Winkel facet. The console reads orders before it changes them (M7), so the selection bar copies and exports
 * only, "Nieuwe bestelling" is greyed out with why, and an order does not open yet (its detail follows). No suppliers
 * until M8.
 */

const iso = (ms: number) => new Date(ms).toISOString()

/** A row as the design's order: amounts in units, `partially_refunded` shown as paid (the design has no such state). */
const orderOf = (o: OrderRow): Order => ({
  id: o.id,
  number: o.number,
  store_id: o.storeId,
  shopify_id: o.shopifyId,
  customer_id: o.customerId ?? "",
  customer_name: o.customerName,
  customer_email: o.customerEmail ?? "",
  status: o.status,
  payment_status: o.paymentStatus === "partially_refunded" ? "paid" : o.paymentStatus,
  fulfillment_status: o.fulfillmentStatus,
  total: o.totalMinor / 100,
  currency: o.currency as Currency,
  line_items: [],
  line_count: o.lineCount,
  ...(o.trackingNumber === null ? {} : { tracking_number: o.trackingNumber }),
  ...(o.carrier === null ? {} : { carrier: o.carrier }),
  tags: [...o.tags],
  created_at: iso(o.placedAt),
  updated_at: iso(o.updatedAt)
})

const ACTIONS: OrdersSource["actions"] = () => [
  {
    id: "copy",
    label: "Bestelnummers kopiëren",
    icon: Copy,
    group: "Exporteren",
    shortcut: "c",
    run: (rows) => copyLines(rows.map((o) => o.number), counted(rows.length, "bestelnummer", "bestelnummers"))
  },
  {
    id: "csv",
    needs: { perm: "data.export" },
    label: "Exporteren als CSV",
    icon: Download,
    group: "Exporteren",
    run: (rows) =>
      exportCsv(
        "bestellingen",
        ["Bestelling", "Klant", "E-mail", "Status", "Totaal", "Geplaatst"],
        rows.map((o) => [o.number, o.customer_name, o.customer_email, o.status, o.total, o.created_at])
      )
  }
]

const NONE: ReadonlyArray<{ value: string; label: string }> = []

export function useConsoleOrdersSource(page: OrderPage, stores: ReadonlyArray<StoreView>): OrdersSource {
  const orders = useMemo(() => page.rows.map(orderOf), [page.rows])
  const names = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores])
  const options = useMemo(() => stores.map((s) => ({ value: s.name, label: s.name })), [stores])
  return {
    orders,
    loading: false,
    stores: options,
    storeName: (id) => names.get(id) ?? "",
    suppliers: NONE,
    supplierName: () => "",
    actions: ACTIONS,
    canCreate: { ok: false, reason: "Bestellingen maken kan hier nog niet" }
  }
}

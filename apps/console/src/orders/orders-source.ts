import type { OrderPage, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrdersSource } from "@insyte/ui/app/orders/source"
import { AlertTriangle, Copy, Download, Tag, Truck } from "@insyte/ui/icons"
import { useMemo } from "react"
import { useOrderCommands } from "./order-writes.ts"

/*
 * The orders list's source in the console (M6.4): `Orders.list`'s rows as the design's orders, the stores by name for
 * the Winkel facet and the suppliers of the orders' forwarding legs for the Leverancier facet and column (M8.2). The
 * selection bar labels, marks fulfilled, and marks or clears a delay through the order commands (M7.1), each with one
 * Undo for the selection, and copies and exports. A delayed order (`delayedAt`) carries the design's `at_risk` marker,
 * so it shows as Vertraagd. Bulk cancelling waits for the selection bar's confirm (cancelling cannot be undone); "Nieuwe
 * bestelling" is greyed out with why until draft orders. A row opens its order over the list.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const AT_RISK = "at_risk"

/** The order's suppliers as its Leverancier column shows them: by name, more than one joined. */
const SUPPLIER_JOIN = ", "
const suppliersOf = (o: OrderRow) => o.suppliers.map((s) => s.name).join(SUPPLIER_JOIN)

/** A row as the design's order: amounts in units, `partially_refunded` shown as paid (the design has no such state). */
export const orderOf = (o: OrderRow): Order => ({
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
  // Insyte's delay is the order's, not Shopify's: the marker follows `delayedAt` alone.
  tags: [...o.tags.filter((t) => t !== AT_RISK), ...(o.delayedAt === null ? [] : [AT_RISK])],
  created_at: iso(o.placedAt),
  updated_at: iso(o.updatedAt)
})

const isClosed = (o: Order) => o.status === "cancelled" || o.status === "refunded"

const actionsOf = (commands: ReturnType<typeof useOrderCommands>): OrdersSource["actions"] => (openTags) => [
  {
    id: "tag",
    needs: { perm: "orders", arg: 2 },
    label: "Label toevoegen",
    icon: Tag,
    group: "Ordenen",
    shortcut: "g",
    run: (rows) => openTags([...rows])
  },
  {
    id: "fulfil",
    needs: { perm: "orders", arg: 2 },
    label: "Als afgehandeld markeren",
    icon: Truck,
    group: "Afhandeling",
    shortcut: "f",
    bar: true,
    applies: (o) => !isClosed(o) && o.fulfillment_status !== "fulfilled",
    run: (rows) =>
      void commands.markFulfilled(
        rows,
        `${counted(rows.length, "bestelling", "bestellingen")} als afgehandeld gemarkeerd`
      )
  },
  {
    id: "flag",
    needs: { perm: "orders", arg: 2 },
    label: "Als vertraagd markeren",
    icon: AlertTriangle,
    group: "Afhandeling",
    shortcut: "d",
    bar: true,
    applies: (o) => !isClosed(o) && o.status !== "delivered" && !o.tags.includes(AT_RISK),
    run: (rows) =>
      void commands.flagDelayed(rows, `${counted(rows.length, "bestelling", "bestellingen")} als vertraagd gemarkeerd`)
  },
  {
    id: "unflag",
    needs: { perm: "orders", arg: 2 },
    label: "Vertraging wissen",
    icon: AlertTriangle,
    group: "Afhandeling",
    applies: (o) => o.tags.includes(AT_RISK),
    run: (rows) =>
      void commands.clearDelay(rows, `Vertraging gewist bij ${counted(rows.length, "bestelling", "bestellingen")}`)
  },
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

/** `open` is the route's: it navigates to the order over the list. */
export function useConsoleOrdersSource(
  page: OrderPage,
  stores: ReadonlyArray<StoreView>,
  open: (order: Order) => void
): OrdersSource {
  const orders = useMemo(() => page.rows.map(orderOf), [page.rows])
  const names = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores])
  const options = useMemo(() => stores.map((s) => ({ value: s.name, label: s.name })), [stores])
  const supplierNames = useMemo(() => new Map(page.rows.map((o) => [o.id, suppliersOf(o)])), [page.rows])
  const suppliers = useMemo(
    () =>
      [...new Set(page.rows.flatMap((o) => o.suppliers.map((s) => s.name)))]
        .toSorted((a, b) => a.localeCompare(b, "nl"))
        .map((name) => ({ value: name, label: name })),
    [page.rows]
  )
  const commands = useOrderCommands()
  return {
    orders,
    loading: false,
    stores: options,
    storeName: (id) => names.get(id) ?? "",
    suppliers,
    supplierName: (id) => supplierNames.get(id) ?? "",
    actions: actionsOf(commands),
    applyTags: (rows, tags, mode) => void commands.applyTags(rows, tags, mode),
    canCreate: { ok: false, reason: "Bestellingen maken kan hier nog niet" },
    open
  }
}

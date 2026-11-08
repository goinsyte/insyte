import type { CustomerPage, CustomerRow } from "@insyte/modules/customers/domain/Customers"
import type { CustomersSource } from "@insyte/ui/app/customers/source"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import { formatDate } from "@insyte/ui/app/lib/format"
import type { Customer } from "@insyte/ui/app/lib/types/domain"
import { Copy, Download } from "@insyte/ui/icons"
import { useMemo } from "react"

/*
 * The customers list's source in the console (M6.4): `Customers.list`'s rows as the design's profiles. The status is
 * the server's facts only: new up to two orders, loyal after; no "at risk" until there is a signal for it, and no
 * duplicates until merging arrives (M7). "Laatste bestelling" is the newest order Insyte holds. Copying and exporting
 * only, until the commands (M7).
 */

const customerOf = (c: CustomerRow): Customer => ({
  id: c.id,
  shopify_id: c.shopifyId,
  email: c.email ?? "",
  name: c.name,
  ...(c.phone === null ? {} : { phone: c.phone }),
  address: { line1: "", city: "", region: "", postal_code: "", country: c.country ?? "" },
  lifetime_value: c.lifetimeValueMinor / 100,
  orders_count: c.ordersCount,
  tags: [...c.tags],
  created_at: new Date(c.lastOrderAt ?? c.updatedAt).toISOString()
})

const ACTIONS: CustomersSource["actions"] = () => [
  {
    id: "copy",
    label: "E-mailadressen kopiëren",
    icon: Copy,
    group: "Exporteren",
    shortcut: "c",
    run: (rows) => copyLines(rows.map((c) => c.email), counted(rows.length, "adres", "adressen"))
  },
  {
    id: "csv",
    needs: { perm: "data.export" },
    label: "Exporteren als CSV",
    icon: Download,
    group: "Exporteren",
    run: (rows) =>
      exportCsv(
        "klanten",
        ["Naam", "E-mail", "Bestellingen", "Klantwaarde", "Status"],
        rows.map((c) => [c.name, c.email, c.orders_count, c.lifetime_value, c.status])
      )
  }
]

export function useConsoleCustomersSource(page: CustomerPage): CustomersSource {
  const customers = useMemo(() => page.rows.map(customerOf), [page.rows])
  const lastOrders = useMemo(() => new Map(page.rows.map((c) => [c.id, c.lastOrderAt])), [page.rows])
  return {
    customers,
    loading: false,
    duplicates: [],
    statusOf: (c) => (c.orders_count <= 2 ? "new" : "loyal"),
    lastOrder: (c) => {
      const at = lastOrders.get(c.id)
      return at === null || at === undefined ? "Nog geen" : formatDate(new Date(at), { day: "2-digit" })
    },
    actions: ACTIONS,
    canCreate: { ok: false, reason: "Klanten toevoegen kan hier nog niet" }
  }
}

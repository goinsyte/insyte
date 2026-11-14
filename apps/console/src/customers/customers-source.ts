import { useAtomValue } from "@effect/atom-react"
import { type CustomerPage, type CustomerRow, NEW_UP_TO_ORDERS } from "@insyte/modules/customers/domain/Customers"
import type { CustomersSource } from "@insyte/ui/app/customers/source"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { DuplicateGroup } from "@insyte/ui/app/lib/duplicates"
import { formatDate } from "@insyte/ui/app/lib/format"
import type { Currency, Customer } from "@insyte/ui/app/lib/types/domain"
import { Copy, Download, GitMerge, Send, Tag } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { duplicatesAtom } from "../data/customers.ts"
import { useGate } from "../frame/refusals.ts"
import { useCustomerCommands } from "./customer-writes.ts"

/*
 * The customers list's source in the console: `Customers.list`'s rows as the design's profiles (M6.4), the duplicates
 * the server finds, and the commands on a selection (M7.4): labels and merging, each with one Undo. The status is the
 * server's facts only: new up to two orders, loyal after; no "at risk" until there is a signal for it. "Laatste
 * bestelling" is the newest order Insyte holds. Synchroniseren naar Klaviyo (M7.5) opens the route's Klaviyo dialog.
 * A row opens the customer over the list; "Klant toevoegen" and the dialogs are the route's.
 */

export const customerOf = (c: CustomerRow): Customer => ({
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

const ACTIONS: CustomersSource["actions"] = (open) => [
  {
    id: "tag",
    needs: { perm: "customers", arg: 2 },
    label: "Label toevoegen",
    icon: Tag,
    group: "Ordenen",
    shortcut: "g",
    run: (rows) => open.tag([...rows])
  },
  {
    id: "merge",
    needs: { perm: "customers.merge" },
    label: "Samenvoegen tot één profiel",
    icon: GitMerge,
    group: "Ordenen",
    run: (rows) => open.merge([...rows])
  },
  {
    id: "klaviyo",
    needs: { perm: "customers", arg: 2 },
    label: "Synchroniseren naar Klaviyo",
    icon: Send,
    group: "Contact",
    shortcut: "k",
    run: (rows) => open.klaviyo([...rows])
  },
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

/** `open` is the route's: it navigates to the customer over the list. */
const NO_GROUPS: ReadonlyArray<DuplicateGroup> = []

export function useConsoleCustomersSource(page: CustomerPage, open: (customer: Customer) => void): CustomersSource {
  const groups = Option.getOrUndefined(AsyncResult.value(useAtomValue(duplicatesAtom)))
  const duplicates = useMemo(() => groups?.map((g) => ({ ...g, ids: [...g.ids] })) ?? NO_GROUPS, [groups])
  const commands = useCustomerCommands()
  const create = useGate("customers", 2)
  const customers = useMemo(() => page.rows.map(customerOf), [page.rows])
  const lastOrders = useMemo(() => new Map(page.rows.map((c) => [c.id, c.lastOrderAt])), [page.rows])
  const currencies = useMemo(() => new Map(page.rows.map((c) => [c.id, c.currency as Currency])), [page.rows])
  return {
    customers,
    loading: false,
    duplicates,
    // The panel's "Nieuw" and "VIP" count by the same line (`Customers.counts`).
    statusOf: (c) => (c.orders_count <= NEW_UP_TO_ORDERS ? "new" : "loyal"),
    lastOrder: (c) => {
      const at = lastOrders.get(c.id)
      return at === null || at === undefined ? "Nog geen" : formatDate(new Date(at), { day: "2-digit" })
    },
    actions: ACTIONS,
    applyTags: (rows, tags, mode) => void commands.applyTags(rows, tags, mode),
    canCreate: create,
    currencyOf: (c) => currencies.get(c.id),
    open
  }
}

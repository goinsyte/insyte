import { useAtomValue } from "@effect/atom-react"
import { type CustomerPage, type CustomerRow, NEW_UP_TO_ORDERS } from "@insyte/modules/customers/domain/Customers"
import type { CustomersSource } from "@insyte/ui/app/customers/source"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { DuplicateGroup } from "@insyte/ui/app/lib/duplicates"
import type { FilterNode, Rule } from "@insyte/ui/app/lib/filter"
import { formatDate } from "@insyte/ui/app/lib/format"
import { firstQuery, type ServerList } from "@insyte/ui/app/lib/server-query"
import type { Currency, Customer } from "@insyte/ui/app/lib/types/domain"
import { PAGE_ROWS } from "@insyte/ui/app/table/data-table"
import { Copy, Download, GitMerge, Send, Tag } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { customersPageAtom, duplicatesAtom } from "../data/customers.ts"
import { firstInput, usePaged } from "../data/paged.ts"
import { useGate } from "../frame/refusals.ts"
import { useCustomerCommands } from "./customer-writes.ts"

/*
 * The customers list's source in the console: `Customers.list`'s rows as the design's profiles (M6.4), the duplicates
 * the server finds, and the commands on a selection (M7.4): labels and merging, each with one Undo. The status is the
 * server's facts only: new up to two orders, loyal after; no "at risk" until there is a signal for it. "Laatste
 * bestelling" is the newest order Insyte holds. Synchroniseren naar Klaviyo (M7.5) opens the route's Klaviyo dialog.
 * A row opens the customer over the list; "Klant toevoegen" and the dialogs are the route's.
 *
 * The list pages on the server (W3.1): the table's filter, search, order and page as `Customers.list`'s input
 * (`customersList`). The status is the console's (new, loyal, or a duplicate the server found), so its rule is written
 * here over what the server filters by: the orders, and the duplicates' ids. The line beside the title counts every
 * profile (the first page's counts, read with no filter or search).
 */

/** A rule nothing matches: no profile has this id. */
const nobody = (id: string): Rule => ({ kind: "rule", id: `${id}-none`, field: "id", op: "any", value: ["-"] })

/** One rule of the host's own. */
const single = (id: string, field: string, op: Rule["op"], value: string | ReadonlyArray<string>): Rule => ({
  kind: "rule",
  id,
  field,
  op,
  value
})

/** The Status facet over the server's fields: by orders, a duplicate by its id, as the screen draws each row. */
const statusRule = (duplicates: ReadonlyArray<string>) => (rule: Rule): FilterNode | undefined => {
  const notDuplicate = duplicates.length === 0 ? [] : [single(`${rule.id}-own`, "id", "none", duplicates)]
  const of = (status: string): FilterNode =>
    status === "new"
      ? {
        kind: "group",
        id: `${rule.id}-new`,
        join: "and",
        children: [single(`${rule.id}-few`, "orders", "lt", String(NEW_UP_TO_ORDERS + 1)), ...notDuplicate]
      }
      : status === "loyal"
      ? {
        kind: "group",
        id: `${rule.id}-loyal`,
        join: "and",
        children: [single(`${rule.id}-many`, "orders", "gt", String(NEW_UP_TO_ORDERS)), ...notDuplicate]
      }
      : status === "duplicate" && duplicates.length > 0
      ? single(`${rule.id}-dup`, "id", "any", duplicates)
      : nobody(`${rule.id}-${status}`)
  if (rule.op === "empty") return nobody(rule.id)
  if (rule.op !== "any" && rule.op !== "none") return undefined
  const chosen: ReadonlyArray<string> = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
  const wanted = rule.op === "any" ? chosen : ["new", "loyal", "duplicate"].filter((s) => !chosen.includes(s))
  return wanted.length === 0
    ? nobody(rule.id)
    : { kind: "group", id: `${rule.id}-status`, join: "or", children: wanted.map(of) }
}

/** The customers table's columns as `Customers.list` filters and sorts them (`CUSTOMER_FIELDS`, `CUSTOMER_SORTS`). */
const customersList = (duplicates: ReadonlyArray<string>): ServerList => ({
  fields: {
    customer: "customer",
    email: "email",
    country: "country",
    orders: "orders",
    clv: "lifetime",
    aov: "aov",
    status: statusRule(duplicates),
    last_order: "last_order"
  },
  sorts: {
    customer: "name",
    email: "email",
    country: "country",
    orders: "orders",
    clv: "lifetime",
    aov: "aov",
    last_order: "last_order"
  },
  // The Status counts as the filter reads them: the duplicates apart (`counts.duplicates`).
  ...(duplicates.length === 0 ? {} : { extra: { duplicates } })
})

/** The first page, the most valuable first as the screen's table first asks for it: what the route reads ahead. */
export const FIRST_CUSTOMERS = firstInput(firstQuery({ id: "clv", desc: true }, PAGE_ROWS), customersList([]))

const SHAPE = customersList([])
const FILTERABLE: ReadonlySet<string> = new Set(Object.keys(SHAPE.fields))
const SORTABLE: ReadonlySet<string> = new Set(Object.keys(SHAPE.sorts))

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

const NO_GROUPS: ReadonlyArray<DuplicateGroup> = []

/** `first` is the route's first page (`FIRST_CUSTOMERS`); `open` navigates to the customer over the list. */
export function useConsoleCustomersSource(first: CustomerPage, open: (customer: Customer) => void): CustomersSource {
  const groups = Option.getOrUndefined(AsyncResult.value(useAtomValue(duplicatesAtom)))
  const duplicates = useMemo(() => groups?.map((g) => ({ ...g, ids: [...g.ids] })) ?? NO_GROUPS, [groups])
  const list = useMemo(() => customersList([...new Set(duplicates.flatMap((g) => g.ids))].toSorted()), [duplicates])
  const { page, current, fetching, failed, retry, onQuery } = usePaged(customersPageAtom, {
    input: FIRST_CUSTOMERS,
    page: first
  }, list)
  const commands = useCustomerCommands()
  const create = useGate("customers", 2)
  const customers = useMemo(() => page.rows.map(customerOf), [page.rows])
  const lastOrders = useMemo(() => new Map(page.rows.map((c) => [c.id, c.lastOrderAt])), [page.rows])
  const currencies = useMemo(() => new Map(page.rows.map((c) => [c.id, c.currency as Currency])), [page.rows])
  const { counts } = page
  const paging = useMemo(() => ({
    total: counts.total,
    all: first.counts.total,
    // Only the page read for what the table asks now hands on its cursor.
    next: current ? page.nextCursor : null,
    fetching,
    failed,
    retry,
    filterable: FILTERABLE,
    sortable: SORTABLE,
    counts: (field: string) =>
      field === "status"
        ? new Map([["new", counts.new], ["loyal", counts.returning], ["duplicate", counts.duplicates]])
        : undefined,
    onQuery
  }), [counts, first.counts.total, page.nextCursor, current, fetching, failed, retry, onQuery])
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
    open,
    paging,
    standing: { customers: first.counts.total, new: first.counts.new }
  }
}

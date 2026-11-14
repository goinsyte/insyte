import { useAtomValue } from "@effect/atom-react"
import type { OrderPage, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { FilterNode, Rule } from "@insyte/ui/app/lib/filter"
import { isSystemTag } from "@insyte/ui/app/lib/order-tags"
import { firstQuery, type ServerList } from "@insyte/ui/app/lib/server-query"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrdersSource } from "@insyte/ui/app/orders/source"
import { PAGE_ROWS } from "@insyte/ui/app/table/data-table"
import { AlertTriangle, Copy, Download, Send, Tag, Truck } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { ordersPageAtom, orderTagsAtom } from "../data/orders.ts"
import { firstInput, usePaged } from "../data/paged.ts"
import { suppliersAtom } from "../data/suppliers.ts"
import { useOrderCommands } from "./order-writes.ts"

/*
 * The orders list's source in the console (M6.4): `Orders.list`'s rows as the design's orders, the stores by name for
 * the Winkel facet and the suppliers of the orders' forwarding legs for the Leverancier facet and column (M8.2). The
 * selection bar labels, marks fulfilled, and marks or clears a delay through the order commands (M7.1), each with one
 * Undo for the selection, and copies and exports. A delayed order (`delayedAt`) carries the design's `at_risk` marker,
 * so it shows as Vertraagd; an order whose parcel the shopper was told of (`trackingSentAt`) carries `tracking_sent`,
 * one whose track-and-trace mail did not go (`trackingFailedAt`) `tracking_failed`. "Track & trace-update sturen" mails
 * each selected order's shopper its newest parcel, once per tracking number. Bulk cancelling waits for the selection
 * bar's confirm (cancelling cannot be undone); "Nieuwe bestelling" is greyed out with why until draft orders. A row
 * opens its order over the list.
 *
 * The list pages on the server (W3.1): the table's filter, search, order and page as `Orders.list`'s input
 * (`ORDERS_LIST`), each column on the field the server filters and sorts it by. The line beside the title counts every
 * order (the first page's counts, read with no filter or search), the Status facet's counts are the server's, the
 * Leverancier facet offers every supplier, and the labels offered are every one in use.
 */

/*
 * The Labels column on the server: a chosen label is one of the order's own tags (`tags`, any of them), and Vertraagd,
 * the one label Insyte sets that the Labels facet offers, is the delay itself (`state`). Words typed are looked for in
 * the order's own tags as text.
 */
const labelsRule = (rule: Rule): FilterNode | undefined => {
  if (rule.op === "empty" || rule.op === "not_empty") return { ...rule, field: "tags" }
  if (!Array.isArray(rule.value)) return { ...rule, field: "tag_text" }
  if (rule.op !== "any" && rule.op !== "none") return undefined
  const chosen: ReadonlyArray<string> = rule.value
  const own = chosen.filter((t) => !isSystemTag(t))
  const parts: Array<FilterNode> = [
    ...(own.length === 0 ? [] : [{ kind: "rule" as const, id: rule.id, field: "tags", op: rule.op, value: own }]),
    ...(chosen.includes(AT_RISK)
      ? [{ kind: "rule" as const, id: `${rule.id}-delayed`, field: "state", op: rule.op, value: ["delayed"] }]
      : [])
  ]
  if (parts.length <= 1) return parts[0]
  return { kind: "group", id: `${rule.id}-labels`, join: rule.op === "any" ? "or" : "and", children: parts }
}

/** The orders table's columns as `Orders.list` filters and sorts them (`ORDER_FIELDS`, `ORDER_SORTS`). */
const ORDERS_LIST: ServerList = {
  fields: {
    number: "number",
    tags: labelsRule,
    customer: "customer_name",
    store: "store_name",
    items: "line_count",
    total: "total",
    cut: "state",
    supplier: "supplier",
    placed: "placed_at"
  },
  sorts: {
    number: "number",
    customer: "customer_name",
    store: "store_name",
    items: "line_count",
    total: "total",
    cut: "state",
    supplier: "supplier",
    placed: "placed_at"
  }
}

/** The first page, as the screen's table first asks for it (newest first): what the route reads ahead. */
export const FIRST_ORDERS = firstInput(firstQuery({ id: "placed", desc: true }, PAGE_ROWS), ORDERS_LIST)

const FILTERABLE: ReadonlySet<string> = new Set(Object.keys(ORDERS_LIST.fields))
const SORTABLE: ReadonlySet<string> = new Set(Object.keys(ORDERS_LIST.sorts))
const OPEN = ["placed", "paid", "at_supplier"]

const iso = (ms: number) => new Date(ms).toISOString()

const AT_RISK = "at_risk"
const TRACKING_SENT = "tracking_sent"
const TRACKING_FAILED = "tracking_failed"
const MARKERS: ReadonlySet<string> = new Set([AT_RISK, TRACKING_SENT, TRACKING_FAILED])

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
  // Insyte's delay and its track-and-trace mail are the order's, not Shopify's: the markers follow Insyte alone.
  tags: [
    ...o.tags.filter((t) => !MARKERS.has(t)),
    ...(o.delayedAt === null ? [] : [AT_RISK]),
    ...(o.trackingSentAt === null ? [] : [TRACKING_SENT]),
    ...(o.trackingFailedAt === null ? [] : [TRACKING_FAILED])
  ],
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
    id: "tracking",
    needs: { perm: "orders", arg: 2 },
    label: "Track & trace-update sturen",
    icon: Send,
    group: "Klanten",
    applies: (o) => o.tracking_number !== undefined && !isClosed(o) && o.status !== "delivered",
    run: (rows) => void commands.sendTrackingUpdate(rows)
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

/** `first` is the route's first page (`FIRST_ORDERS`); `open` navigates to the order over the list. */
export function useConsoleOrdersSource(
  first: OrderPage,
  stores: ReadonlyArray<StoreView>,
  open: (order: Order) => void
): OrdersSource {
  const { page, current, fetching, failed, retry, onQuery } = usePaged(ordersPageAtom, {
    input: FIRST_ORDERS,
    page: first
  }, ORDERS_LIST)
  const orders = useMemo(() => page.rows.map(orderOf), [page.rows])
  const names = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores])
  const options = useMemo(() => stores.map((s) => ({ value: s.name, label: s.name })), [stores])
  const supplierNames = useMemo(() => new Map(page.rows.map((o) => [o.id, suppliersOf(o)])), [page.rows])
  // Every supplier where the role may see them, else the ones on this page.
  const known = Option.getOrUndefined(AsyncResult.value(useAtomValue(suppliersAtom)))
  const suppliers = useMemo(
    () =>
      [
        ...new Set([
          ...(known?.rows ?? []).map((s) => s.name),
          ...page.rows.flatMap((o) => o.suppliers.map((s) => s.name))
        ])
      ]
        .toSorted((a, b) => a.localeCompare(b, "nl"))
        .map((name) => ({ value: name, label: name })),
    [known, page.rows]
  )
  const inUse = Option.getOrUndefined(AsyncResult.value(useAtomValue(orderTagsAtom)))
  const knownTags = useMemo(() => inUse?.map((t) => t.tag).filter((t) => !isSystemTag(t)), [inUse])
  const commands = useOrderCommands()
  const { status, delayed } = first.counts
  const sum = (keys: ReadonlyArray<string>) => keys.reduce((n, k) => n + (status[k] ?? 0), 0)
  const state = page.counts.state
  const paging = useMemo(() => ({
    total: page.counts.total,
    all: first.counts.total,
    // Only the page read for what the table asks now hands on its cursor.
    next: current ? page.nextCursor : null,
    fetching,
    failed,
    retry,
    filterable: FILTERABLE,
    sortable: SORTABLE,
    counts: (field: string) => (field === "cut" ? new Map(Object.entries(state)) : undefined),
    onQuery
  }), [page.counts.total, first.counts.total, page.nextCursor, current, fetching, failed, retry, state, onQuery])
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
    open,
    paging,
    standing: `${sum(OPEN)} wachten op afhandeling · ${sum(["shipped"])} onderweg · ${delayed} vertraagd`,
    knownTags
  }
}

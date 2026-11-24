import { useMemo, useState } from "react"
import {
  addEvent,
  busyName,
  busyTags,
  CARRIERS,
  changeDesk,
  counted,
  deskOrders,
  isClosed,
  isConcept,
  KNOWN_TAGS,
  money,
  PAYMENTS,
  restoreDesk,
  setStatus,
  shipped,
  stamp,
  statusOf,
  storeName,
  suppliersOf,
  units,
  useDesk
} from "../../fixtures/order-desk.ts"
import { customer, CUSTOMERS, ORDER_STATUS, product, PRODUCTS, supplier, SUPPLIERS } from "../../fixtures/records.ts"
import type { Order, OrderStatus } from "../../fixtures/records.ts"
import { ME, STORES } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { emptyGroup } from "../../ui/filter-model.ts"
import { ColumnPicker, FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption } from "../../ui/filters.tsx"
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  MessageSquare,
  Plus,
  Send,
  ShoppingBag,
  TagGlyph,
  Truck,
  XCircle
} from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { PeriodPicker, PRESETS } from "../../ui/period.tsx"
import type { Period } from "../../ui/period.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { fileSupplierTickets } from "../suppliers/tickets.ts"
import { NewOrderDialog, TagDialog } from "./dialogs.tsx"
import { filterRows, isoDay, manyField, rule, useListFilter, where } from "./list-filter.ts"
import type { Address, ListField } from "./list-filter.ts"
import { copyText, exportCsv, LoadError, TableSkeleton, undoable } from "./parts.tsx"

/*
 * Bestellingen (`/app`'s `_admin/orders/index.tsx`, `orders-screen.tsx`): every order from 16 November
 * until now, with the cuts the old tab strip made as filters that compose, a period, the columns you
 * want, and what to do with the rows you tick. Filters, the period and the page live in the address
 * (`?status=vertraagd`, `?periode=vandaag`), so a menu row or Start can link straight to a cut.
 */

const PAGE_SIZE = 50
const FIRST_DAY = new Date(2026, 10, 16)
const TODAY = new Date(2026, 10, 23)
const ALL: Period = { preset: "alles", range: { from: FIRST_DAY, to: TODAY }, compare: "geen" }

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y ?? 2026, (m ?? 11) - 1, d ?? 23)
}

/** The period in the address: a preset's id, or a range `?van=…&tot=…`; none is everything. */
function usePeriod(): Period {
  const preset = useQuery("periode")
  const from = useQuery("van")
  const to = useQuery("tot")
  return useMemo(() => {
    const hit = PRESETS.find((p) => p.id === preset)
    if (hit !== undefined) return { preset: hit.id, range: hit.range(TODAY), compare: "geen" }
    if (from !== null && to !== null) {
      return { preset: "aangepast", range: { from: fromIso(from), to: fromIso(to) }, compare: "geen" }
    }
    return ALL
  }, [preset, from, to])
}

function choosePeriod(next: Period) {
  const preset = PRESETS.some((p) => p.id === next.preset)
  setQuery({
    periode: preset ? next.preset : null,
    van: preset ? null : iso(next.range.from),
    tot: preset ? null : iso(next.range.to),
    pagina: null
  })
}

/*
 * What the list can be cut by. The address keeps the cuts other screens link to: Start's statuses
 * (`?status=vertraagd`), a supplier's orders (`?leverancier=kestrel-goods`), a customer's and a
 * product's (`?klant=…`, `?product=…`).
 */
const STATUS_FIELD: ListField<Order> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(ORDER_STATUS).map((s) => s.label),
  get: (o) => ORDER_STATUS[o.status].label
}
const SUPPLIER_FIELD = manyField<Order>(
  "leverancier",
  "Leverancier",
  SUPPLIERS.map((s) => s.name),
  (o) => suppliersOf(o).map((s) => supplier(s)?.name ?? s)
)
const LABEL_FIELD = manyField<Order>("label", "Label", KNOWN_TAGS, (o) => o.tags)
const TOTAL_FIELD: ListField<Order> = { key: "totaal", label: "Totaal", type: "number", get: (o) => o.total }

const FIELDS: ReadonlyArray<ListField<Order>> = [
  STATUS_FIELD,
  SUPPLIER_FIELD,
  { key: "vervoerder", label: "Vervoerder", type: "option", options: [...CARRIERS], get: (o) => o.carrier },
  {
    key: "winkel",
    label: "Winkel",
    type: "option",
    options: STORES.filter((s) => s.connected).map((s) => s.name),
    get: (o) => storeName(o.storeId)
  },
  LABEL_FIELD,
  manyField<Order>(
    "product",
    "Product",
    PRODUCTS.map((p) => p.name),
    (o) => [...new Set(o.lines.map((l) => product(l.productId)?.name ?? l.productId))]
  ),
  { key: "klant", label: "Klant", type: "text", get: (o) => customer(o.customerId)?.name ?? "" },
  TOTAL_FIELD,
  { key: "artikelen", label: "Artikelen", type: "number", get: units },
  {
    key: "betaling",
    label: "Betaalmethode",
    type: "option",
    options: [...PAYMENTS],
    get: (o) => o.payment
  },
  { key: "geplaatst", label: "Geplaatst", type: "date", get: (o) => isoDay(o.placedAt) }
]

const ADDRESS: Address = {
  params: [
    {
      param: "status",
      field: "status",
      values: Object.fromEntries(Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]))
    },
    { param: "leverancier", field: "leverancier", values: Object.fromEntries(SUPPLIERS.map((s) => [s.id, s.name])) },
    { param: "vervoerder", field: "vervoerder", values: Object.fromEntries(CARRIERS.map((c) => [c.toLowerCase(), c])) },
    {
      param: "winkel",
      field: "winkel",
      values: Object.fromEntries(STORES.filter((s) => s.connected).map((s) => [s.id, s.name]))
    },
    { param: "label", field: "label" },
    { param: "product", field: "product", values: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.name])) },
    { param: "klant", field: "klant", values: Object.fromEntries(CUSTOMERS.map((c) => [c.id, c.name])) }
  ]
}

const VIEWS = "bestellingen"
seedViews(VIEWS, [
  { name: "Te laat", pinned: false, filter: where("and", rule(STATUS_FIELD, "any", ["Vertraagd"])) },
  { name: "Wacht op leverancier", pinned: false, filter: where("and", rule(STATUS_FIELD, "any", ["Bij leverancier"])) },
  { name: "VIP", pinned: false, filter: where("and", rule(LABEL_FIELD, "any", ["vip"])) }
])

const COLUMNS: ReadonlyArray<ColumnOption> = [
  { key: "number", label: "Bestelling", locked: true },
  { key: "customer", label: "Klant" },
  { key: "items", label: "Artikelen" },
  { key: "store", label: "Winkel" },
  { key: "supplier", label: "Leverancier" },
  { key: "carrier", label: "Vervoerder" },
  { key: "status", label: "Status" },
  { key: "total", label: "Totaal" },
  { key: "placed", label: "Geplaatst" }
]
const DEFAULT_COLUMNS = new Set(["number", "customer", "items", "supplier", "status", "total", "placed"])

/** "12 wachten op afhandeling · 30 onderweg · 8 vertraagd", over what the period holds. */
function standing(orders: ReadonlyArray<Order>): string {
  const open = orders.filter((o) => o.status === "betaald" || o.status === "bij-leverancier").length
  const transit = orders.filter((o) => o.status === "verzonden").length
  const late = orders.filter((o) => o.status === "vertraagd").length
  return `${open.toLocaleString("nl-NL")} wachten op afhandeling · ${
    transit.toLocaleString("nl-NL")
  } onderweg · ${late} vertraagd`
}

/** Moves orders to a status, with a line in their history and the way back. */
const mark = (list: ReadonlyArray<Order>, status: OrderStatus, title: string, line: string) => {
  const before = changeDesk((d) => setStatus(d, list.map((o) => o.number), status, () => line))
  undoable(title, () => restoreDesk(before))
}
const orders = (list: ReadonlyArray<Order>) => counted(list.length, "bestelling", "bestellingen")
const followUp = (list: ReadonlyArray<Order>) =>
  fileSupplierTickets(
    list.flatMap((o) =>
      suppliersOf(o).map((s) => ({
        supplierId: s,
        subject: `Overdrachtsdatum bevestigen voor #${o.number}`,
        note: `Vraag ${
          supplier(s)?.name ?? "de leverancier"
        } om de overdrachtsdatum en het track & trace-nummer van #${o.number}, en laat het daarna ${
          busyName(o, false)
        } weten.`,
        priority: o.status === "vertraagd" ? "hoog" as const : "gemiddeld" as const,
        customerId: o.customerId,
        order: o.number
      }))
    )
  )

export function OrdersList() {
  const view = useView()
  const access = useAccess("orders")
  const state = dataState(view)
  const busy = view.staat === "druk"
  const desk = useDesk()
  const period = usePeriod()
  const q = useQuery("q") ?? ""
  const page = Math.max(1, Number(useQuery("pagina") ?? "1") || 1)
  const newOpen = useQuery("nieuw") === "1" && access.edit
  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS)
  const [visible, setVisible] = useState<ReadonlySet<string>>(DEFAULT_COLUMNS)
  const [sort, setSort] = useState<{ readonly key: "placed" | "total"; readonly dir: Exclude<Sort, null> }>({
    key: "placed",
    dir: "desc"
  })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [tagging, setTagging] = useState<ReadonlyArray<Order> | null>(null)
  const [cancelling, setCancelling] = useState<ReadonlyArray<Order> | null>(null)

  const inPeriod = useMemo(() => {
    const from = period.range.from.getTime()
    const to = period.range.to.getTime() + 86_400_000
    return deskOrders(desk).filter((o) => o.placedAt.getTime() >= from && o.placedAt.getTime() < to)
  }, [desk, period])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "")
    const shown = filterRows(inPeriod, filter, FIELDS, isoDay(TODAY)).filter((o) => {
      if (needle === "") return true
      const hay = `${o.number} ${busyName(o, busy)} ${customer(o.customerId)?.email ?? ""}`.toLowerCase()
      return hay.includes(needle)
    })
    const dir = sort.dir === "asc" ? 1 : -1
    return shown.toSorted((a, b) =>
      sort.key === "total" ? (a.total - b.total) * dir : (a.placedAt.getTime() - b.placedAt.getTime()) * dir
    )
  }, [inPeriod, q, busy, sort, filter])

  const last = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const at = Math.min(page, last)
  const pageRows = rows.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE)
  const picked = rows.filter((o) => selected.has(o.number))
  const allOn = pageRows.length > 0 && pageRows.every((o) => selected.has(o.number))
  const someOn = pageRows.some((o) => selected.has(o.number))
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: "placed" | "total") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const clear = () => {
    setFilter(emptyGroup())
    setQuery({ q: null, periode: null, van: null, tot: null, pagina: null })
  }

  if (!access.view) {
    return (
      <Page>
        <Denied area="orders" what="de bestellingen" />
      </Page>
    )
  }

  const head = (
    <PageHead
      title="Bestellingen"
      after={state === "ready" ? <span className="figure">{rows.length.toLocaleString("nl-NL")}</span> : undefined}
      meta={state === "ready" ? standing(inPeriod) : state === "empty" ? "0 bestellingen" : undefined}
      actions={access.edit && state !== "loading"
        ? <ButtonLink to={`${paths.orders}?nieuw=1`} variant="primary" icon={<Plus />}>Nieuwe bestelling</ButtonLink>
        : undefined}
    />
  )
  const dialog = <NewOrderDialog open={newOpen} onClose={() => setQuery({ nieuw: null })} />

  if (state === "loading") {
    return (
      <Page>
        {head}
        <TableSkeleton columns={[64, 150, 40, 120, 100, 80, 90]} />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page>
        {head}
        <LoadError what="De bestellingen" detail="GET /orders · 504 · req_9f2c71" />
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page>
        {head}
        <EmptyState
          glyph={ShoppingBag}
          title="Nog geen bestellingen"
          action={
            <>
              <ButtonLink to={paths.settings("winkels")} variant="primary">Winkel koppelen</ButtonLink>
              {access.edit && <ButtonLink to={`${paths.orders}?nieuw=1`}>Nieuwe bestelling</ButtonLink>}
            </>
          }
        >
          Bestellingen komen binnen een minuut na een winkelsynchronisatie binnen, met artikelen, klant en leverancier
          al gekoppeld.
        </EmptyState>
        {dialog}
      </Page>
    )
  }

  const EDIT = { area: "orders", level: 2 } as const
  /** One list for the bar, the Acties menu and the keys; each says which ticked orders it fits. */
  const actions: ReadonlyArray<RowAction<Order>> = [
    {
      id: "label",
      label: "Label toevoegen",
      icon: <TagGlyph />,
      bar: true,
      shortcut: "l",
      needs: EDIT,
      run: setTagging
    },
    {
      id: "afgehandeld",
      label: "Als afgehandeld markeren",
      icon: <Truck />,
      group: "Status",
      bar: true,
      shortcut: "a",
      needs: EDIT,
      applies: (o) => !isClosed(o) && !shipped(o.status) && !isConcept(o),
      run: (list) =>
        mark(
          list,
          "verzonden",
          `${orders(list)} als afgehandeld gemarkeerd`,
          `Als afgehandeld gemarkeerd door ${ME.name}`
        )
    },
    {
      id: "vertraagd",
      label: "Als vertraagd markeren",
      icon: <AlertTriangle />,
      group: "Status",
      shortcut: "v",
      needs: EDIT,
      applies: (o) => !isClosed(o) && o.status !== "vertraagd" && o.status !== "bezorgd",
      run: (list) =>
        mark(list, "vertraagd", `${orders(list)} als vertraagd gemarkeerd`, `Als vertraagd gemarkeerd door ${ME.name}`)
    },
    {
      id: "vertraging-wissen",
      label: "Vertraging wissen",
      icon: <Check />,
      group: "Status",
      needs: EDIT,
      applies: (o) => o.status === "vertraagd",
      run: (list) =>
        mark(list, "verzonden", `Vertraging gewist bij ${orders(list)}`, `Vertraging gewist door ${ME.name}`)
    },
    {
      id: "opvolgen",
      label: "Leverancier opvolgen",
      icon: <MessageSquare />,
      group: "Opvolgen",
      bar: true,
      shortcut: "o",
      needs: EDIT,
      applies: (o) => !isClosed(o) && (!shipped(o.status) || o.status === "vertraagd"),
      run: followUp
    },
    {
      id: "track-trace",
      label: "Track & trace sturen",
      icon: <Send />,
      group: "Opvolgen",
      shortcut: "t",
      needs: EDIT,
      applies: (o) => shipped(o.status) && !isClosed(o),
      run: (list) => {
        const before = changeDesk((d) =>
          list.reduce((acc, o) => addEvent(acc, o.number, "Track & trace-update gestuurd aan de klant"), d)
        )
        undoable(
          `Track & trace-update gaat naar ${counted(list.length, "klant", "klanten")}`,
          () => restoreDesk(before),
          "Hij vertrekt na de verzendtijd van 30 seconden."
        )
      }
    },
    {
      id: "kopieren",
      label: "Nummers kopiëren",
      icon: <Copy />,
      group: "Delen",
      shortcut: "c",
      run: (list) =>
        copyText(list.map((o) => `#${o.number}`).join("\n"), list.length === 1 ? "Bestelnummer" : "Bestelnummers")
    },
    {
      id: "exporteren",
      label: "Exporteren",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      run: (list) => exportOrders(list, busy)
    },
    {
      id: "annuleren",
      label: "Annuleren",
      icon: <XCircle />,
      group: "Delen",
      tone: "danger",
      needs: EDIT,
      applies: (o) => !isClosed(o) && !shipped(o.status),
      run: setCancelling
    }
  ]

  return (
    <Page>
      {head}
      {!access.edit && <ReadOnlyNotice area="orders" />}
      <div className="flex flex-col gap-3">
        <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle bestellingen" />
        {picked.length > 0
          ? (
            <SelectionBar
              rows={picked}
              actions={actions}
              noun={["bestelling", "bestellingen"]}
              onClear={() => setSelected(new Set())}
            />
          )
          : (
            <ListToolbar
              start={
                <>
                  <div className="w-full sm:w-64">
                    <SearchField
                      label="Bestellingen zoeken"
                      value={q}
                      onChange={(v) => setQuery({ q: v === "" ? null : v, pagina: null })}
                      placeholder="Zoek op nummer, klant of e-mail"
                    />
                  </div>
                  <FilterRules fields={FIELDS} rows={inPeriod} value={filter} onChange={setFilter} />
                  <FilterBuilder fields={FIELDS} rows={inPeriod} value={filter} onChange={setFilter} views={VIEWS} />
                </>
              }
              end={
                <>
                  <PeriodPicker value={period} onChange={choosePeriod} today={TODAY} />
                  <ColumnPicker columns={COLUMNS} visible={visible} onChange={setVisible} />
                </>
              }
            />
          )}

        {rows.length === 0
          ? (
            <EmptyState
              size="sm"
              glyph={ShoppingBag}
              title="Geen bestellingen voor deze filters"
              action={<Button size="sm" onClick={clear}>Filters wissen</Button>}
              className="py-14"
            >
              Pas de filters of de periode aan, of wis ze.
            </EmptyState>
          )
          : (
            <>
              {/* A phone reads an order as two lines: who and which, then where it stands and what it is worth. */}
              <ul aria-label="Bestellingen" className="flex flex-col sm:hidden">
                {pageRows.map((o) => {
                  const status = statusOf(o)
                  return (
                    <li key={o.number} className="border-b border-line last:border-0">
                      <Link
                        to={paths.order(o.number)}
                        className="flex min-h-14 flex-col justify-center gap-0.5 py-2 active:bg-hover"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-ink">
                            <span className="figure font-medium">#{o.number}</span> · {busyName(o, busy)}
                          </span>
                          <span className="figure shrink-0 text-sm text-ink">{money(o.total)}</span>
                        </span>
                        <span className="flex items-baseline justify-between gap-3">
                          <Status tone={status.tone}>{status.label}</Status>
                          <span className="figure shrink-0 text-xs text-ink-3">{stamp(o.placedAt)}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <div className="hidden sm:block">
                <Table label="Bestellingen" minWidth={760}>
                  <THead>
                    <Th width={40}>
                      <RowCheckbox
                        label="Alles op deze pagina kiezen"
                        checked={allOn}
                        indeterminate={!allOn && someOn}
                        onChange={(on) =>
                          setSelected((s) => {
                            const next = new Set(s)
                            for (const o of pageRows) {
                              if (on) next.add(o.number)
                              else next.delete(o.number)
                            }
                            return next
                          })}
                      />
                    </Th>
                    <Th>Bestelling</Th>
                    {show("customer") && <Th>Klant</Th>}
                    {show("items") && <Th align="right">Artikelen</Th>}
                    {show("store") && <Th>Winkel</Th>}
                    {show("supplier") && <Th>Leverancier</Th>}
                    {show("carrier") && <Th>Vervoerder</Th>}
                    {show("status") && <Th>Status</Th>}
                    {show("total") && (
                      <Th
                        align="right"
                        sort={sort.key === "total" ? sort.dir : null}
                        onSort={() => toggleSort("total")}
                      >
                        Totaal
                      </Th>
                    )}
                    {show("placed") && (
                      <Th
                        align="right"
                        sort={sort.key === "placed" ? sort.dir : null}
                        onSort={() => toggleSort("placed")}
                      >
                        Geplaatst
                      </Th>
                    )}
                  </THead>
                  <TBody>
                    {pageRows.map((o) => {
                      const tags = busyTags(o, busy)
                      const status = statusOf(o)
                      return (
                        <Tr
                          key={o.number}
                          selected={selected.has(o.number)}
                          onOpen={() => navigate(paths.order(o.number))}
                        >
                          <Td>
                            <RowCheckbox
                              label={`#${o.number} kiezen`}
                              checked={selected.has(o.number)}
                              onChange={(on) =>
                                setSelected((s) => {
                                  const next = new Set(s)
                                  if (on) next.add(o.number)
                                  else next.delete(o.number)
                                  return next
                                })}
                            />
                          </Td>
                          <Td header>
                            <span className="flex items-center gap-2">
                              <Link
                                to={paths.order(o.number)}
                                className="figure font-medium text-ink hover:underline pointer-coarse:py-3"
                              >
                                #{o.number}
                              </Link>
                              {tags.length > 0 && (
                                <Tag className="max-w-28 truncate">
                                  {tags[0]}
                                  {tags.length > 1 ? ` +${tags.length - 1}` : ""}
                                </Tag>
                              )}
                            </span>
                          </Td>
                          {show("customer") && (
                            <Td>
                              <span className="block max-w-56 truncate text-ink">{busyName(o, busy)}</span>
                            </Td>
                          )}
                          {show("items") && <Td figure muted>{units(o)}</Td>}
                          {show("store") && <Td muted>{storeName(o.storeId)}</Td>}
                          {show("supplier") && (
                            <Td muted>
                              <span className="block max-w-44 truncate">
                                {suppliersOf(o).map((s) => supplier(s)?.name ?? s).join(", ")}
                              </span>
                            </Td>
                          )}
                          {show("carrier") && (
                            <Td muted>
                              <span className="flex items-center gap-2">
                                <ServiceLogo service={o.carrier} name={o.carrier} size={18} />
                                {o.carrier}
                              </span>
                            </Td>
                          )}
                          {show("status") && (
                            <Td>
                              <Status tone={status.tone}>{status.label}</Status>
                            </Td>
                          )}
                          {show("total") && <Td figure>{money(o.total)}</Td>}
                          {show("placed") && <Td figure muted>{stamp(o.placedAt)}</Td>}
                        </Tr>
                      )
                    })}
                  </TBody>
                </Table>
              </div>
              <Pagination
                page={at}
                pageSize={PAGE_SIZE}
                total={rows.length}
                onChange={(p) => setQuery({ pagina: p === 1 ? null : String(p) })}
              />
            </>
          )}
      </div>

      {dialog}
      <TagDialog
        orders={tagging}
        onClose={() => {
          setTagging(null)
          setSelected(new Set())
        }}
      />
      <AlertDialog
        open={cancelling !== null}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const list = cancelling ?? []
          const before = changeDesk((d) =>
            setStatus(
              d,
              list.map((o) => o.number),
              "geannuleerd",
              () => `Geannuleerd door ${ME.name}; de klant krijgt een mail`
            )
          )
          setCancelling(null)
          setSelected(new Set())
          undoable(
            list.length === 1 ? `#${list[0]?.number ?? ""} geannuleerd` : `${list.length} bestellingen geannuleerd`,
            () => restoreDesk(before),
            "De klant krijgt de mail na de verzendtijd van 30 seconden."
          )
        }}
        title={(cancelling?.length ?? 0) === 1
          ? `#${cancelling?.[0]?.number ?? ""} annuleren?`
          : `${cancelling?.length ?? 0} bestellingen annuleren?`}
        body={`Dit stopt de afhandeling, geeft gereserveerde voorraad vrij en laat het de klant weten. ${
          money((cancelling ?? []).reduce((s, o) => s + o.total, 0))
        } gaat terug. Na de verzendtijd van 30 seconden kun je een annulering niet meer terugdraaien.`}
        confirmLabel={(cancelling?.length ?? 0) === 1 ? "Bestelling annuleren" : "Bestellingen annuleren"}
        cancelLabel="Niet annuleren"
      />
    </Page>
  )
}

function exportOrders(list: ReadonlyArray<Order>, busy: boolean) {
  exportCsv(
    "bestellingen",
    ["Bestelling", "Klant", "E-mail", "Status", "Totaal", "Geplaatst"],
    list.map((o) => [
      `#${o.number}`,
      busyName(o, busy),
      customer(o.customerId)?.email ?? "",
      statusOf(o).label,
      o.total.toLocaleString("nl-NL", { minimumFractionDigits: 2 }),
      stamp(o.placedAt)
    ])
  )
}

import { useMemo, useState } from "react"
import {
  addEvent,
  busyName,
  busyTags,
  CARRIERS,
  changeDesk,
  deskOrders,
  isClosed,
  KNOWN_TAGS,
  money,
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
import { customer, ORDER_STATUS, supplier, SUPPLIERS } from "../../fixtures/records.ts"
import type { Order, OrderStatus } from "../../fixtures/records.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { AddFilter, ColumnPicker, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption, FilterField } from "../../ui/filters.tsx"
import {
  AlertTriangle,
  Building,
  Copy,
  Download,
  Factory,
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
import { dataState, useView } from "../../view.ts"
import { NewOrderDialog, TagDialog } from "./dialogs.tsx"
import { copyText, exportCsv, LoadError, TableSkeleton, toggleQuery, undoable, useQueryList } from "./parts.tsx"

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

/* The filters: the address holds slugs, the chips and the menu show words. */
type Field = FilterField & {
  readonly values: Readonly<Record<string, string>>
  readonly match: (o: Order, v: string) => boolean
}

const FIELDS: ReadonlyArray<Field> = [
  {
    key: "status",
    label: "Status",
    glyph: TagGlyph,
    values: Object.fromEntries(Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])),
    options: Object.values(ORDER_STATUS).map((s) => s.label),
    match: (o, v) => o.status === v
  },
  {
    key: "leverancier",
    label: "Leverancier",
    glyph: Factory,
    values: Object.fromEntries(SUPPLIERS.map((s) => [s.id, s.name])),
    options: SUPPLIERS.map((s) => s.name),
    match: (o, v) => suppliersOf(o).includes(v)
  },
  {
    key: "vervoerder",
    label: "Vervoerder",
    glyph: Truck,
    values: Object.fromEntries(CARRIERS.map((c) => [c.toLowerCase(), c])),
    options: [...CARRIERS],
    match: (o, v) => o.carrier.toLowerCase() === v
  },
  {
    key: "winkel",
    label: "Winkel",
    glyph: Building,
    values: Object.fromEntries(STORES.filter((s) => s.connected).map((s) => [s.id, s.name])),
    options: STORES.filter((s) => s.connected).map((s) => s.name),
    match: (o, v) => o.storeId === v
  },
  {
    key: "label",
    label: "Label",
    glyph: TagGlyph,
    values: Object.fromEntries(KNOWN_TAGS.map((t) => [t, t])),
    options: [...KNOWN_TAGS],
    match: (o, v) => o.tags.includes(v)
  }
]

const clear = () =>
  setQuery({
    q: null,
    status: null,
    leverancier: null,
    vervoerder: null,
    winkel: null,
    label: null,
    periode: null,
    van: null,
    tot: null,
    pagina: null
  })

const slugOf = (field: Field, label: string) => Object.entries(field.values).find(([, l]) => l === label)?.[0] ?? label

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
  const filters = {
    status: useQueryList("status"),
    leverancier: useQueryList("leverancier"),
    vervoerder: useQueryList("vervoerder"),
    winkel: useQueryList("winkel"),
    label: useQueryList("label")
  } as const
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
    const shown = inPeriod.filter((o) => {
      if (needle !== "") {
        const hay = `${o.number} ${busyName(o, busy)} ${customer(o.customerId)?.email ?? ""}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return FIELDS.every((f) => {
        const on = filters[f.key as keyof typeof filters]
        return on.length === 0 || on.some((v) => f.match(o, v))
      })
    })
    const dir = sort.dir === "asc" ? 1 : -1
    return shown.toSorted((a, b) =>
      sort.key === "total" ? (a.total - b.total) * dir : (a.placedAt.getTime() - b.placedAt.getTime()) * dir
    )
    // The filter lists are new arrays per render; their joined values are what changes.
  }, [
    inPeriod,
    q,
    busy,
    sort,
    filters.status.join(),
    filters.leverancier.join(),
    filters.vervoerder.join(),
    filters.winkel.join(),
    filters.label.join()
  ])

  const last = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const at = Math.min(page, last)
  const pageRows = rows.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE)
  const picked = rows.filter((o) => selected.has(o.number))
  const allOn = pageRows.length > 0 && pageRows.every((o) => selected.has(o.number))
  const someOn = pageRows.some((o) => selected.has(o.number))
  const active = FIELDS.flatMap((f) => filters[f.key as keyof typeof filters].map((v) => ({ field: f, value: v })))
  const anyFilter = active.length > 0 || q !== "" || period.preset !== "alles"
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: "placed" | "total") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))

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

  const mark = (list: ReadonlyArray<Order>, status: OrderStatus, title: string, line: string) => {
    const before = changeDesk((d) => setStatus(d, list.map((o) => o.number), status, () => line))
    setSelected(new Set())
    undoable(title, () => restoreDesk(before))
  }
  const late = picked.filter((o) => !isClosed(o) && o.status !== "vertraagd" && o.status !== "bezorgd")
  const tracked = picked.filter((o) => shipped(o.status) && !isClosed(o))
  const cancellable = picked.filter((o) => !isClosed(o) && !shipped(o.status))

  return (
    <Page>
      {head}
      {!access.edit && <ReadOnlyNotice area="orders" />}
      <div className="flex flex-col gap-3">
        {picked.length > 0
          ? (
            <SelectionBar
              count={picked.length}
              noun={["bestelling", "bestellingen"]}
              onClear={() => setSelected(new Set())}
            >
              {access.edit && (
                <SelectionAction icon={<TagGlyph />} onClick={() => setTagging(picked)}>
                  Label toevoegen
                </SelectionAction>
              )}
              {access.edit && late.length > 0 && (
                <SelectionAction
                  icon={<AlertTriangle />}
                  onClick={() =>
                    mark(
                      late,
                      "vertraagd",
                      `${late.length === 1 ? "1 bestelling" : `${late.length} bestellingen`} als vertraagd gemarkeerd`,
                      "Als vertraagd gemarkeerd door Elena Hart"
                    )}
                >
                  Als vertraagd markeren
                </SelectionAction>
              )}
              {access.edit && tracked.length > 0 && (
                <SelectionAction
                  icon={<Send />}
                  onClick={() => {
                    const before = changeDesk((d) =>
                      tracked.reduce(
                        (acc, o) => addEvent(acc, o.number, "Track & trace-update gestuurd aan de klant"),
                        d
                      )
                    )
                    setSelected(new Set())
                    undoable(
                      `Track & trace-update gaat naar ${
                        tracked.length === 1 ? "1 klant" : `${tracked.length} klanten`
                      }`,
                      () => restoreDesk(before),
                      "Hij vertrekt na de verzendtijd van 30 seconden."
                    )
                  }}
                >
                  Track & trace sturen
                </SelectionAction>
              )}
              <SelectionAction
                icon={<Copy />}
                onClick={() =>
                  copyText(
                    picked.map((o) => `#${o.number}`).join("\n"),
                    picked.length === 1 ? "Bestelnummer" : "Bestelnummers"
                  )}
              >
                Nummers kopiëren
              </SelectionAction>
              <SelectionAction icon={<Download />} onClick={() => exportOrders(picked, busy)}>
                Exporteren
              </SelectionAction>
              {access.edit && cancellable.length > 0 && (
                <SelectionAction
                  icon={<XCircle />}
                  tone="danger"
                  onClick={() => setCancelling(cancellable)}
                >
                  Annuleren
                </SelectionAction>
              )}
            </SelectionBar>
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
                  {active.map(({ field, value }) => (
                    <FilterChip
                      key={`${field.key}-${value}`}
                      field={field.label}
                      value={field.values[value] ?? value}
                      onRemove={() => toggleQuery(field.key, filters[field.key as keyof typeof filters], value)}
                    />
                  ))}
                  <AddFilter
                    fields={FIELDS}
                    active={new Set(active.map(({ field, value }) => `${field.key}:${field.values[value] ?? value}`))}
                    onAdd={(key, label) => {
                      const field = FIELDS.find((f) => f.key === key)
                      if (field !== undefined) {
                        toggleQuery(
                          key,
                          filters[key as keyof typeof filters],
                          slugOf(field, label)
                        )
                      }
                    }}
                  />
                  {anyFilter && <Button variant="ghost" size="sm" onClick={clear}>Wissen</Button>}
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
              () => "Geannuleerd door Elena Hart; de klant krijgt een mail"
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

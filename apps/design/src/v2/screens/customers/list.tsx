import { useMemo, useState } from "react"
import {
  counted,
  COUNTRY,
  customerCounts,
  customerRows,
  duplicateGroups,
  SEGMENT,
  useCustomerState
} from "../../fixtures/customers.ts"
import type { CustomerRow } from "../../fixtures/customers.ts"
import { euro, when } from "../../fixtures/records.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { RecordLabel, Status } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { emptyGroup } from "../../ui/filter-model.ts"
import { ColumnPicker, FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption } from "../../ui/filters.tsx"
import { Copy, Download, GitMerge, Mail, Plus, Send, TagGlyph, Ticket, Users } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { filterRows, isoDay, manyField, rule, useListFilter, where } from "../orders/list-filter.ts"
import type { Address, ListField } from "../orders/list-filter.ts"
import { KlaviyoDialog, MergeReview, NewCustomerDialog, TagDialog } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

const PAGE = 25

const TODAY = "2026-11-23"

const STATUS_FIELD: ListField<CustomerRow> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(SEGMENT).map((x) => x.label),
  get: (r) => SEGMENT[r.segment].label
}
const VALUE_FIELD: ListField<CustomerRow> = { key: "waarde", label: "Klantwaarde", type: "number", get: (r) => r.value }

/** The fields, with the labels the profiles carry now as the label field's options. */
const fieldsFor = (tags: ReadonlyArray<string>): ReadonlyArray<ListField<CustomerRow>> => [
  STATUS_FIELD,
  manyField<CustomerRow>("label", "Label", tags, (r) => r.tags),
  { key: "land", label: "Land", type: "option", get: (r) => COUNTRY[r.country] },
  { key: "plaats", label: "Plaats", type: "text", get: (r) => r.city },
  { key: "bestellingen", label: "Bestellingen", type: "number", get: (r) => r.orders },
  VALUE_FIELD,
  { key: "gemiddeld", label: "Gem. bestelling", type: "number", get: (r) => Math.round(r.aov) },
  {
    key: "laatste",
    label: "Laatste bestelling",
    type: "date",
    get: (r) => (r.lastOrder === undefined ? "" : isoDay(r.lastOrder.placedAt))
  }
]
const LABEL_FIELD = manyField<CustomerRow>("label", "Label", [], (r) => r.tags)

/** The menu's segments (`?segment=risico`) and VIP, which is a label (`?segment=vip`); the country by name. */
const ADDRESS: Address = {
  params: [
    {
      param: "segment",
      field: "status",
      values: Object.fromEntries(Object.entries(SEGMENT).map(([k, v]) => [k, v.label]))
    },
    { param: "land", field: "land" }
  ],
  cuts: { param: "segment", filters: { vip: where("and", rule(LABEL_FIELD, "any", ["vip"])) } }
}

const VIEWS = "klanten"
seedViews(VIEWS, [
  { name: "VIP", pinned: false, filter: where("and", rule(LABEL_FIELD, "any", ["vip"])) },
  { name: "Risico", pinned: false, filter: where("and", rule(STATUS_FIELD, "any", ["Risico"])) },
  {
    name: "Trouw, boven € 500",
    pinned: false,
    filter: where("and", rule(STATUS_FIELD, "any", ["Trouw"]), rule(VALUE_FIELD, "gt", "500"))
  }
])

const COLUMNS: ReadonlyArray<ColumnOption> = [
  { key: "customer", label: "Klant", locked: true },
  { key: "email", label: "E-mail" },
  { key: "country", label: "Land" },
  { key: "orders", label: "Bestellingen" },
  { key: "value", label: "Klantwaarde" },
  { key: "aov", label: "Gem. bestelling" },
  { key: "segment", label: "Status" },
  { key: "last", label: "Laatste bestelling" }
]

type SortKey = "value" | "orders" | "last" | "name"

/**
 * Klanten (`/app/customers`): every profile, with what it is worth and how it stands. The line under
 * the title is counted from the profiles: how many, how many are new, how many look like the same
 * person twice. That last one is work with a name on it, so it gets the one notice on the page and
 * opens the duplicate review. Search, segment and country live in the address, so a view can be linked.
 */
export function CustomersList() {
  const view = useView()
  const s = useCustomerState()
  const access = useAccess("customers")
  const state = dataState(view)
  const zoek = useQuery("zoek") ?? ""
  const reviewing = useQuery("samenvoegen") === "1"

  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set(COLUMNS.map((c) => c.key)))
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "value", dir: "desc" })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"new" | "tag" | "klaviyo" | null>(null)
  // The rows a dialog works on: the selection is cleared as soon as an action starts.
  const [dialogRows, setDialogRows] = useState<ReadonlyArray<CustomerRow>>([])
  // The shell's Nieuw menu and ⌘K open it with `?nieuw=1`.
  const asked = useQuery("nieuw") === "1" && access.edit
  const [mergeGroups, setMergeGroups] = useState<ReturnType<typeof duplicateGroups> | null>(null)

  const all = customerRows(view, s)
  const counts = customerCounts(view, s)
  const groups = duplicateGroups(s)
  const tagKey = [...new Set(all.flatMap((r) => r.tags))].toSorted((a, b) => a.localeCompare(b, "nl")).join("\n")
  const FIELDS = useMemo(() => fieldsFor(tagKey === "" ? [] : tagKey.split("\n")), [tagKey])
  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS, () => setPage(1))

  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = filterRows(all, filter, FIELDS, TODAY).filter((r) =>
      q === "" || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    )
    const value = (r: CustomerRow) =>
      sort.key === "value"
        ? r.value
        : sort.key === "orders"
        ? r.orders
        : sort.key === "last"
        ? r.lastOrder?.placedAt.getTime() ?? 0
        : 0
    return out.toSorted((a, b) =>
      sort.key === "name"
        ? a.name.localeCompare(b.name, "nl") * (sort.dir === "asc" ? 1 : -1)
        : (value(a) - value(b)) * (sort.dir === "asc" ? 1 : -1)
    )
  }, [all, zoek, filter, sort, FIELDS])

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const picked = rows.filter((r) => selected.has(r.id))
  const allOn = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))
  const someOn = pageRows.some((r) => selected.has(r.id))
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)

  const clearFilters = () => {
    setFilter(emptyGroup())
    setQuery({ zoek: null })
  }

  const openReview = (g = groups) => {
    setMergeGroups(g)
    setQuery({ samenvoegen: "1" })
  }
  const closeReview = () => {
    setMergeGroups(null)
    setQuery({ samenvoegen: null })
  }
  const mergePicked = (list: ReadonlyArray<CustomerRow>) => {
    if (list.length >= 2) {
      openReview([{
        key: list.map((p) => p.id).join("+"),
        ids: list.map((p) => p.id),
        match: "zelfde naam en land"
      }])
      return
    }
    const g = groups.find((x) => list[0] !== undefined && x.ids.includes(list[0].id))
    if (g === undefined) {
      toast({ title: "Kies twee of meer profielen om samen te voegen, of bekijk de dubbele profielen." })
    } else openReview([g])
  }

  const withDialog = (which: "tag" | "klaviyo") => (list: ReadonlyArray<CustomerRow>) => {
    setDialogRows(list)
    setDialog(which)
  }
  const EDIT = { area: "customers", level: 2 } as const
  /** One list for the bar, the Acties menu and the keys. */
  const actions: ReadonlyArray<RowAction<CustomerRow>> = [
    {
      id: "mailen",
      label: "E-mailen",
      icon: <Mail />,
      bar: true,
      shortcut: "m",
      needs: EDIT,
      run: (list) =>
        toast({
          title: "Je mailprogramma opent",
          body: `${counted(list.length, "adres", "adressen")} in bcc. Er gaat niets uit voor jij op verzenden drukt.`
        })
    },
    {
      id: "label",
      label: "Label toevoegen",
      icon: <TagGlyph />,
      bar: true,
      shortcut: "l",
      needs: EDIT,
      run: withDialog("tag")
    },
    {
      id: "samenvoegen",
      label: "Samenvoegen",
      icon: <GitMerge />,
      bar: true,
      needs: { area: "customers", level: 3 },
      run: mergePicked
    },
    {
      id: "ticket",
      label: "Ticket per klant",
      icon: <Ticket />,
      group: "Opvolgen",
      shortcut: "t",
      // It takes both: the role's missing one is the one named.
      needs: access.edit ? { area: "support", level: 2 } : EDIT,
      run: (list) =>
        toast({
          title: `${counted(list.length, "ticket", "tickets")} geopend`,
          body: "‘Opvolgen met …’ per klant, op het bord van de inbox.",
          tone: "good",
          action: { label: "Openen", onClick: () => navigate(paths.tickets) }
        })
    },
    {
      id: "klaviyo",
      label: "Naar Klaviyo",
      icon: <Send />,
      group: "Opvolgen",
      needs: EDIT,
      run: withDialog("klaviyo")
    },
    {
      id: "kopieren",
      label: "E-mailadressen kopiëren",
      icon: <Copy />,
      group: "Delen",
      shortcut: "c",
      run: (list) => {
        void navigator.clipboard?.writeText(list.map((p) => p.email).join(", ")).catch(() => undefined)
        toast({ title: `${counted(list.length, "adres", "adressen")} gekopieerd` })
      }
    },
    {
      id: "csv",
      label: "CSV",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      needs: { area: "data", level: 1 },
      run: () => toast({ title: "Export gestart", body: "klanten.csv staat zo bij je downloads." })
    }
  ]

  const meta = state === "ready"
    ? `${counted(counts.all, "klant", "klanten")} · ${counts.nieuw} nieuw · ${
      counts.dubbelProfielen === 0 ? "geen dubbele profielen" : `${counts.dubbelProfielen} lijken dubbel`
    }`
    : undefined

  if (!access.view) {
    return (
      <Page>
        <PageHead title="Klanten" />
        <Denied area="customers" what="de klanten" />
      </Page>
    )
  }

  return (
    <Page>
      <PageHead
        title="Klanten"
        meta={meta}
        actions={access.edit && state !== "loading" && state !== "error"
          ? (
            <Button variant="primary" icon={<Plus />} onClick={() => setDialog("new")}>
              Nieuwe klant
            </Button>
          )
          : undefined}
      />

      {!access.edit && <ReadOnlyNotice area="customers" />}

      {state === "loading" && <TableSkeleton label="Klanten laden" columns={7} />}
      {state === "error" && (
        <PageError title="De klanten kwamen niet binnen" detail="GET /customers · 503 · shopify-sync">
          Shopify antwoordde niet op tijd. Je bestellingen en tickets werken gewoon; de klantenlijst probeert het
          opnieuw.
        </PageError>
      )}
      {state === "empty" && (
        <EmptyState
          glyph={Users}
          title="Nog geen klanten"
          action={
            <Button variant="primary" onClick={() => navigate(paths.settings("koppelingen"))}>Winkel koppelen</Button>
          }
        >
          Elke klant die bij een gekoppelde winkel bestelt, staat hier, met bestellingen, tickets en chargebacks al
          gekoppeld. Koppel je Shopify-winkel en de profielen komen binnen.
        </EmptyState>
      )}

      {state === "ready" && (
        <div className="flex min-w-0 flex-col gap-4">
          {groups.length > 0 && (
            <Notice
              title={`${groups.length} ${
                groups.length === 1 ? "persoon staat" : "personen staan"
              } er meer dan één keer in`}
              action={access.manage
                ? <Button size="sm" icon={<GitMerge />} onClick={() => openReview()}>Bekijken</Button>
                : undefined}
            >
              Hetzelfde e-mailadres, of dezelfde naam in hetzelfde land. Er wordt niets samengevoegd tot jij dat zegt.
              {!access.manage && <Denied area="customers" need={3} size="inline" className="mt-2" />}
            </Notice>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle klanten" />
            {picked.length > 0
              ? (
                <SelectionBar
                  rows={picked}
                  actions={actions}
                  noun={["klant", "klanten"]}
                  onClear={() => setSelected(new Set())}
                />
              )
              : (
                <ListToolbar
                  start={
                    <>
                      <div className="w-full sm:w-64">
                        <SearchField
                          label="Klanten zoeken"
                          value={zoek}
                          onChange={(next) => {
                            setPage(1)
                            setQuery({ zoek: next === "" ? null : next })
                          }}
                          placeholder="Zoek op naam of e-mail"
                        />
                      </div>
                      <FilterRules fields={FIELDS} rows={all} value={filter} onChange={setFilter} />
                      <FilterBuilder fields={FIELDS} rows={all} value={filter} onChange={setFilter} views={VIEWS} />
                    </>
                  }
                  end={<ColumnPicker columns={COLUMNS} visible={visible} onChange={setVisible} />}
                />
              )}

            {rows.length === 0
              ? (
                <EmptyState
                  glyph={Users}
                  size="sm"
                  title="Geen klanten voor deze filters"
                  action={<Button size="sm" onClick={clearFilters}>Filters wissen</Button>}
                  className="py-14"
                >
                  Pas de zoekterm of de filters aan, of wis ze.
                </EmptyState>
              )
              : (
                <Table label="Klanten" minWidth={920}>
                  <THead>
                    <Th width={40}>
                      <RowCheckbox
                        label="Alle klanten op deze pagina kiezen"
                        checked={allOn}
                        indeterminate={!allOn && someOn}
                        onChange={(on) =>
                          setSelected((cur) => {
                            const next = new Set(cur)
                            for (const r of pageRows) {
                              if (on) next.add(r.id)
                              else next.delete(r.id)
                            }
                            return next
                          })}
                      />
                    </Th>
                    <Th sort={sortOf("name")} onSort={() => toggleSort("name")}>Klant</Th>
                    {show("email") && <Th>E-mail</Th>}
                    {show("country") && <Th>Land</Th>}
                    {show("orders") && (
                      <Th align="right" sort={sortOf("orders")} onSort={() => toggleSort("orders")}>Bestellingen</Th>
                    )}
                    {show("value") && (
                      <Th align="right" sort={sortOf("value")} onSort={() => toggleSort("value")}>Klantwaarde</Th>
                    )}
                    {show("aov") && <Th align="right">Gem. bestelling</Th>}
                    {show("segment") && <Th>Status</Th>}
                    {show("last") && (
                      <Th align="right" sort={sortOf("last")} onSort={() => toggleSort("last")}>Laatste bestelling</Th>
                    )}
                  </THead>
                  <TBody>
                    {pageRows.map((r) => (
                      <Tr
                        key={r.id}
                        selected={selected.has(r.id)}
                        onOpen={() => navigate(paths.customer(r.id))}
                      >
                        <Td>
                          <RowCheckbox
                            label={`${r.name} kiezen`}
                            checked={selected.has(r.id)}
                            onChange={(on) =>
                              setSelected((cur) => {
                                const next = new Set(cur)
                                if (on) next.add(r.id)
                                else next.delete(r.id)
                                return next
                              })}
                          />
                        </Td>
                        <Td header>
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={r.name} size={24} />
                            <Link
                              to={paths.customer(r.id)}
                              className="max-w-[16rem] truncate font-medium text-ink hover:underline"
                            >
                              {r.name}
                            </Link>
                            {r.tags.slice(0, 2).map((t) => <RecordLabel key={t}>{t}</RecordLabel>)}
                            {r.tags.length > 2 && <span className="text-xs text-ink-3">+{r.tags.length - 2}</span>}
                          </span>
                        </Td>
                        {show("email") && <Td muted className="max-w-[15rem] truncate">{r.email}</Td>}
                        {show("country") && <Td muted>{COUNTRY[r.country]}</Td>}
                        {show("orders") && <Td figure align="right">{r.orders.toLocaleString("nl-NL")}</Td>}
                        {show("value") && <Td figure align="right">{euro(r.value)}</Td>}
                        {show("aov") && <Td figure align="right" muted>{euro(Math.round(r.aov))}</Td>}
                        {show("segment") && (
                          <Td>
                            <Status tone={SEGMENT[r.segment].tone}>{SEGMENT[r.segment].label}</Status>
                          </Td>
                        )}
                        {show("last") && (
                          <Td align="right" muted className="figure whitespace-nowrap">
                            {r.lastOrder === undefined ? "—" : when(r.lastOrder.placedAt)}
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            {rows.length > PAGE && (
              <div>
                <Pagination
                  page={page}
                  pageSize={PAGE}
                  total={rows.length}
                  onChange={setPage}
                  label="Pagina's klanten"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <NewCustomerDialog
        open={dialog === "new" || asked}
        onClose={() => {
          setDialog(null)
          setQuery({ nieuw: null })
        }}
      />
      <TagDialog open={dialog === "tag"} onClose={() => setDialog(null)} picked={dialogRows} />
      <KlaviyoDialog open={dialog === "klaviyo"} onClose={() => setDialog(null)} picked={dialogRows} />
      <MergeReview open={reviewing && access.manage} onClose={closeReview} groups={mergeGroups ?? groups} />
    </Page>
  )
}

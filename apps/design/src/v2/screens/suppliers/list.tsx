import { useMemo, useState } from "react"
import { COMPLAINT_THRESHOLD, percent, supplierQuality, useProductState } from "../../fixtures/products.ts"
import { decimal, PORTAL, supplierCounts, supplierRows, useSupplierState, VIA } from "../../fixtures/suppliers.ts"
import type { SupplierRow } from "../../fixtures/suppliers.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Link } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { emptyGroup } from "../../ui/filter-model.ts"
import { FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import { Download, Factory, Mail, Pause, Play, Plus, UserPlus } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr, useSelection } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { filterRows, rule, useListFilter, where } from "../orders/list-filter.ts"
import type { Address, ListField } from "../orders/list-filter.ts"
import { InviteDialog, MailDialog, SupplierFormDialog, withUndo } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

const STATUS_LABEL = { actief: "Actief", uitgenodigd: "Uitgenodigd", gepauzeerd: "Gepauzeerd" } as const

const STATUS_FIELD: ListField<SupplierRow> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(STATUS_LABEL),
  get: (r) => STATUS_LABEL[r.status]
}
const PORTAL_FIELD: ListField<SupplierRow> = {
  key: "portaal",
  label: "Portaal",
  type: "option",
  options: Object.values(PORTAL).map((p) => p.label),
  get: (r) => PORTAL[r.portal].label
}
const API_FIELD: ListField<SupplierRow> = {
  key: "api",
  label: "API",
  type: "option",
  options: ["Gekoppeld", "Niet gekoppeld"],
  get: (r) => (r.apiConnected ? "Gekoppeld" : "Niet gekoppeld")
}
const LATE_FIELD: ListField<SupplierRow> = { key: "laat", label: "Te laat", type: "number", get: (r) => r.late.length }
const SLOWER_FIELD: ListField<SupplierRow> = {
  key: "trager",
  label: "Dagen trager dan beloofd",
  type: "number",
  get: (r) => (r.leadDays === 0 ? null : r.leadDays - r.promiseDays)
}

const FIELDS: ReadonlyArray<ListField<SupplierRow>> = [
  STATUS_FIELD,
  PORTAL_FIELD,
  { key: "via", label: "Bestellingen via", type: "option", options: Object.values(VIA), get: (r) => VIA[r.via] },
  API_FIELD,
  { key: "land", label: "Land", type: "option", get: (r) => r.country },
  LATE_FIELD,
  { key: "open", label: "Open", type: "number", get: (r) => r.open.length },
  SLOWER_FIELD,
  {
    key: "optijd",
    label: "Op tijd, %",
    type: "number",
    get: (r) => (r.onTime === null ? null : Math.round(r.onTime * 100))
  },
  { key: "producten", label: "Producten", type: "number", get: (r) => r.products.length }
]

const LATE = where("and", rule(LATE_FIELD, "gt", "0"))

/** The menu's cuts, as the address says them (`?weergave=vertraagd`). */
const ADDRESS: Address = {
  cuts: {
    param: "weergave",
    filters: {
      vertraagd: LATE,
      uitgenodigd: where("and", rule(PORTAL_FIELD, "any", [PORTAL.uitgenodigd.label])),
      api: where("and", rule(API_FIELD, "any", ["Gekoppeld"]))
    }
  }
}

const VIEWS = "leveranciers"
seedViews(VIEWS, [
  { name: "Vertraagd", pinned: false, filter: LATE },
  { name: "Trager dan beloofd", pinned: false, filter: where("and", rule(SLOWER_FIELD, "gt", "0")) },
  { name: "Gepauzeerd", pinned: false, filter: where("and", rule(STATUS_FIELD, "any", ["Gepauzeerd"])) }
])

type SortKey = "name" | "late" | "lead" | "onTime"

const pause = (list: ReadonlyArray<SupplierRow>, paused: boolean) =>
  withUndo(
    paused
      ? `${list.length} ${list.length === 1 ? "leverancier" : "leveranciers"} gepauzeerd`
      : `${list.length} ${list.length === 1 ? "leverancier" : "leveranciers"} hervat`,
    paused ? "Nieuwe bestellingen wachten tot je ze hervat." : undefined,
    (s) => ({
      ...s,
      edits: { ...s.edits, ...Object.fromEntries(list.map((r) => [r.id, { ...s.edits[r.id], paused }])) }
    })
  )

/**
 * Leveranciers (`/app/suppliers`): who makes what, and whether they keep their word. Lead time is
 * read against what they promised, late orders are counted per supplier, and how orders reach them
 * (API, portal or e-mail) sits beside the portal's state. A row opens the supplier's page.
 */
export function SuppliersList() {
  const view = useView()
  const st = useSupplierState()
  const ps = useProductState()
  const access = useAccess("suppliers")
  const state = dataState(view)
  const zoek = useQuery("zoek") ?? ""
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "late", dir: "desc" })
  const [dialog, setDialog] = useState<"invite" | "mail" | "new" | null>(null)
  // Who the mail goes to: the selection is cleared as soon as an action starts.
  const [mailTo, setMailTo] = useState<ReadonlyArray<SupplierRow>>([])
  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS)

  const all = supplierRows(view, st)
  const counts = supplierCounts(view, st)
  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = filterRows(all, filter, FIELDS, "2026-11-23").filter((r) =>
      q === "" || r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q)
    )
    const val = (r: SupplierRow) =>
      sort.key === "late" ? r.late.length : sort.key === "lead" ? r.leadDays - r.promiseDays : r.onTime ?? 2
    const dir = sort.dir === "asc" ? 1 : -1
    return out.toSorted((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name, "nl") : val(a) - val(b)) * dir)
  }, [all, zoek, filter, sort])
  const selection = useSelection(rows)
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)
  const EDIT = { area: "suppliers", level: 2 } as const
  /** One list for the bar, the Acties menu and the keys. */
  const actions: ReadonlyArray<RowAction<SupplierRow>> = [
    {
      id: "mailen",
      label: "E-mailen",
      icon: <Mail />,
      bar: true,
      shortcut: "m",
      run: (list) => {
        setMailTo(list)
        setDialog("mail")
      }
    },
    {
      id: "pauzeren",
      label: "Pauzeren",
      icon: <Pause />,
      bar: true,
      shortcut: "p",
      needs: EDIT,
      applies: (r) => !r.paused,
      run: (list) => pause(list, true)
    },
    {
      id: "hervatten",
      label: "Hervatten",
      icon: <Play />,
      bar: true,
      shortcut: "h",
      needs: EDIT,
      applies: (r) => r.paused,
      run: (list) => pause(list, false)
    },
    {
      id: "csv",
      label: "CSV",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      run: () => toast({ title: "Export gestart", body: "leveranciers.csv staat zo bij je downloads." })
    }
  ]

  if (!access.view) {
    return (
      <Page>
        <PageHead title="Leveranciers" />
        <Denied area="suppliers" what="de leveranciers" />
      </Page>
    )
  }

  return (
    <Page>
      <PageHead
        title="Leveranciers"
        meta={state === "ready"
          ? `${counts.all} leveranciers · ${counts.lateOrders} bestellingen te laat bij ${counts.late} · ${counts.slow} trager dan beloofd`
          : undefined}
        actions={access.edit && state !== "loading" && state !== "error"
          ? (
            <>
              <Button icon={<Plus />} onClick={() => setDialog("new")}>Nieuwe leverancier</Button>
              <Button variant="primary" icon={<UserPlus />} onClick={() => setDialog("invite")}>
                Leverancier uitnodigen
              </Button>
            </>
          )
          : undefined}
      />
      {!access.edit && <ReadOnlyNotice area="suppliers" />}

      {state === "loading" && <TableSkeleton label="Leveranciers laden" columns={7} rows={5} />}
      {state === "error" && (
        <PageError title="De leveranciers kwamen niet binnen" detail="GET /suppliers · 502">
          De lijst laadde niet. Bestellingen gaan gewoon door naar je leveranciers.
        </PageError>
      )}
      {state === "empty" && (
        <EmptyState
          glyph={Factory}
          title="Nog geen leveranciers"
          action={access.edit
            ? (
              <Button variant="primary" icon={<UserPlus />} onClick={() => setDialog("invite")}>
                Leverancier uitnodigen
              </Button>
            )
            : undefined}
        >
          Nodig de partij uit die je producten maakt of verstuurt. Ze krijgen hun bestellingen in een portaal, per
          e-mail of via hun eigen systeem.
        </EmptyState>
      )}

      {state === "ready" && (
        <div className="flex min-w-0 flex-col gap-3">
          <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle leveranciers" />
          {selection.picked.length > 0
            ? (
              <SelectionBar
                rows={selection.picked}
                actions={actions}
                noun={["leverancier", "leveranciers"]}
                onClear={selection.clear}
              />
            )
            : (
              <ListToolbar
                start={
                  <>
                    <div className="w-full sm:w-64">
                      <SearchField
                        label="Leveranciers zoeken"
                        value={zoek}
                        onChange={(next) => setQuery({ zoek: next === "" ? null : next })}
                        placeholder="Zoek op naam of contactpersoon"
                      />
                    </div>
                    <FilterRules fields={FIELDS} rows={all} value={filter} onChange={setFilter} />
                    <FilterBuilder fields={FIELDS} rows={all} value={filter} onChange={setFilter} views={VIEWS} />
                  </>
                }
              />
            )}

          {rows.length === 0
            ? (
              <EmptyState
                glyph={Factory}
                size="sm"
                title="Geen leveranciers voor deze filters"
                className="py-14"
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilter(emptyGroup())
                      setQuery({ zoek: null })
                    }}
                  >
                    Filters wissen
                  </Button>
                }
              >
                Pas de zoekterm of de filters aan, of wis ze.
              </EmptyState>
            )
            : (
              <Table label="Leveranciers" minWidth={1080}>
                <THead>
                  <Th width={40}>
                    <RowCheckbox
                      label="Alle leveranciers kiezen"
                      checked={selection.all}
                      indeterminate={selection.some}
                      onChange={selection.setAll}
                    />
                  </Th>
                  <Th sort={sortOf("name")} onSort={() => toggleSort("name")}>Leverancier</Th>
                  <Th align="right">Producten</Th>
                  <Th align="right">Open</Th>
                  <Th align="right" sort={sortOf("late")} onSort={() => toggleSort("late")}>Te laat</Th>
                  <Th align="right" sort={sortOf("lead")} onSort={() => toggleSort("lead")}>Levertijd</Th>
                  <Th align="right" sort={sortOf("onTime")} onSort={() => toggleSort("onTime")}>Op tijd</Th>
                  <Th align="right">Klachten</Th>
                  <Th align="right">Controles</Th>
                  <Th>Bestellingen via</Th>
                  <Th>Portaal</Th>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const slow = r.leadDays > r.promiseDays
                    const q = supplierQuality(r.id, ps)
                    return (
                      <Tr key={r.id} selected={selection.has(r.id)} onOpen={() => navigate(paths.supplier(r.id))}>
                        <Td>
                          <RowCheckbox
                            label={`${r.name} kiezen`}
                            checked={selection.has(r.id)}
                            onChange={(on) => selection.toggle(r.id, on)}
                          />
                        </Td>
                        <Td header className="py-1.5">
                          <span className="flex min-w-0 flex-col">
                            <span className="flex min-w-0 items-center gap-2">
                              <Link
                                to={paths.supplier(r.id)}
                                className="max-w-[18rem] truncate font-medium text-ink hover:underline"
                              >
                                {r.name}
                              </Link>
                              {r.paused && <Status tone="neutral">Gepauzeerd</Status>}
                            </span>
                            <span className="max-w-[18rem] truncate text-2xs text-ink-3">
                              {r.supplies} · {r.country}
                            </span>
                          </span>
                        </Td>
                        <Td figure align="right">{r.products.length}</Td>
                        <Td figure align="right">{r.open.length}</Td>
                        <Td
                          figure
                          align="right"
                          className={r.late.length > 0 ? "font-medium text-bad-ink" : "text-ink-3"}
                        >
                          {r.late.length}
                        </Td>
                        <Td figure align="right" className={slow ? "text-warn-ink" : undefined}>
                          {r.leadDays === 0 ? <span className="text-ink-3">—</span> : (
                            <>
                              {decimal(r.leadDays)}
                              <span className="text-ink-3">/ {r.promiseDays} d</span>
                            </>
                          )}
                        </Td>
                        <Td
                          figure
                          align="right"
                          className={r.onTime === null ? "text-ink-3" : r.onTime < 0.8 ? "text-bad-ink" : undefined}
                        >
                          {r.onTime === null ? "—" : `${Math.round(r.onTime * 100)}%`}
                        </Td>
                        <Td
                          figure
                          align="right"
                          className={q.sold === 0 ? "text-ink-3" : q.over ? "font-medium text-warn-ink" : undefined}
                        >
                          <span
                            title={q.sold === 0
                              ? undefined
                              : `${q.complaints} op ${q.sold.toLocaleString("nl-NL")} verkocht in 90 dagen, grens ${
                                percent(COMPLAINT_THRESHOLD)
                              }`}
                          >
                            {q.sold === 0 ? "—" : percent(q.rate, 1)}
                          </span>
                        </Td>
                        <Td figure align="right" className={q.judged === 0 ? "text-ink-3" : undefined}>
                          {q.judged === 0
                            ? "—"
                            : (
                              <span className={q.passed < q.judged ? "text-warn-ink" : undefined}>
                                {q.passed} van {q.judged}
                              </span>
                            )}
                        </Td>
                        <Td muted>{VIA[r.via]}{r.auto && ", automatisch"}</Td>
                        <Td>
                          <Status tone={PORTAL[r.portal].tone}>{PORTAL[r.portal].label}</Status>
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
            )}
        </div>
      )}

      <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} />
      <SupplierFormDialog open={dialog === "new"} onClose={() => setDialog(null)} />
      <MailDialog
        open={dialog === "mail"}
        onClose={() => setDialog(null)}
        to={mailTo.map((r) => ({ name: r.name, email: r.email }))}
      />
    </Page>
  )
}

import { useMemo, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  CATEGORIES,
  decimal,
  lowStockPick,
  percent,
  PHASE,
  productCounts,
  productRows,
  qualityOf,
  STATUS,
  STOCK,
  useProductState
} from "../../fixtures/products.ts"
import type { Category, ProductRow } from "../../fixtures/products.ts"
import { euro } from "../../fixtures/records.ts"
import type { ProductStatus } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { appendTo, emptyGroup, updateNode } from "../../ui/filter-model.ts"
import { ColumnPicker, FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption } from "../../ui/filters.tsx"
import { Archive, BadgePercent, Copy, Download, Edit, Package, Play, Plus, Truck, Upload } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { Proposal } from "../../ui/proposal.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { filterRows, rule, useListFilter, where } from "../orders/list-filter.ts"
import type { Address, ListField } from "../orders/list-filter.ts"
import { ImportDialog, MarginDialog, NewProductDialog, withUndo } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"
import { askRestock } from "./restock.ts"

const PAGE = 25

const COLUMNS: ReadonlyArray<ColumnOption> = [
  { key: "product", label: "Product", locked: true },
  { key: "status", label: "Status" },
  { key: "price", label: "Prijs" },
  { key: "cost", label: "Inkoop" },
  { key: "margin", label: "Marge" },
  { key: "stock", label: "Voorraad" },
  { key: "sold", label: "Verkocht" },
  { key: "rate", label: "Retour" },
  { key: "supplier", label: "Leverancier" }
]

const STATUS_FIELD: ListField<ProductRow> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(STATUS).map((x) => x.label),
  get: (r) => STATUS[r.status].label
}
const STOCK_FIELD: ListField<ProductRow> = {
  key: "voorraad",
  label: "Voorraad",
  type: "option",
  options: Object.values(STOCK).map((x) => x.label),
  get: (r) => STOCK[r.level].label
}
const CATEGORY_FIELD: ListField<ProductRow> = {
  key: "categorie",
  label: "Categorie",
  type: "option",
  options: CATEGORIES,
  get: (r) => r.category
}
const QUALITY_FIELD: ListField<ProductRow> = {
  key: "kwaliteit",
  label: "Kwaliteit",
  type: "option",
  options: Object.values(PHASE).map((x) => x.label),
  get: (r) => PHASE[qualityOf(r).phase].label
}
const MARGIN_FIELD: ListField<ProductRow> = {
  key: "marge",
  label: "Marge, %",
  type: "number",
  get: (r) => r.margin * 100
}
const RATE_FIELD: ListField<ProductRow> = {
  key: "retour",
  label: "Retour, %",
  type: "number",
  get: (r) => r.rate * 100
}

const FIELDS: ReadonlyArray<ListField<ProductRow>> = [
  STATUS_FIELD,
  STOCK_FIELD,
  CATEGORY_FIELD,
  { key: "leverancier", label: "Leverancier", type: "option", get: (r) => r.supplierName },
  QUALITY_FIELD,
  { key: "prijs", label: "Prijs", type: "number", get: (r) => r.price },
  MARGIN_FIELD,
  { key: "aantal", label: "Aantal op voorraad", type: "number", get: (r) => r.stock },
  { key: "verkocht", label: "Verkocht, 16–22 nov", type: "number", get: (r) => r.sold },
  RATE_FIELD,
  { key: "sku", label: "SKU", type: "text", get: (r) => r.sku }
]

const LOW = where("and", rule(STATUS_FIELD, "any", ["Actief"]), rule(STOCK_FIELD, "none", ["Op voorraad"]))
const HIGH_RETURNS = where("and", rule(RATE_FIELD, "gt", "10"))

/** The menu's cuts as the address says them (`?weergave=laag`), and the links by supplier and category. */
const ADDRESS: Address = {
  params: [{ param: "leverancier", field: "leverancier" }, { param: "categorie", field: "categorie" }],
  cuts: {
    param: "weergave",
    filters: {
      actief: where("and", rule(STATUS_FIELD, "any", ["Actief"])),
      concept: where("and", rule(STATUS_FIELD, "any", ["Concept"])),
      gearchiveerd: where("and", rule(STATUS_FIELD, "any", ["Gearchiveerd"])),
      laag: LOW,
      retour: HIGH_RETURNS,
      toezicht: where("and", rule(QUALITY_FIELD, "any", [PHASE.toezicht.label]))
    }
  }
}

const VIEWS = "producten"
seedViews(VIEWS, [
  { name: "Lage voorraad", pinned: false, filter: LOW },
  { name: "Retour boven 10%", pinned: false, filter: HIGH_RETURNS },
  { name: "Marge onder 50%", pinned: false, filter: where("and", rule(MARGIN_FIELD, "lt", "50")) }
])

type SortKey = "name" | "price" | "margin" | "stock" | "sold" | "rate"

/** Low enough to order more: active, and not plainly in stock. */
const needsRestock = (r: ProductRow) => r.status === "actief" && r.level !== "op-voorraad"

const setStatus = (list: ReadonlyArray<ProductRow>, status: ProductStatus) =>
  withUndo(
    `${list.length} ${list.length === 1 ? "product" : "producten"} op ${STATUS[status].label.toLowerCase()} gezet`,
    undefined,
    (st) => ({
      ...st,
      edits: { ...st.edits, ...Object.fromEntries(list.map((p) => [p.id, { ...st.edits[p.id], status }])) }
    })
  )

/**
 * Producten (`/app/products`): the catalogue with what an operator decides on: stock against the
 * pace it sells, margin, last week's sales and returns, and who supplies it. The one proposal on the
 * page is the low-stock advice: the product that runs out first at its own pace, with pausing its ads
 * and asking the supplier for a date as the decision at its foot.
 */
export function ProductsList() {
  const view = useView()
  const s = useProductState()
  const access = useAccess("products")
  const state = dataState(view)
  const layout = useQuery("indeling") === "categorieen" ? "categorieen" : "lijst"
  const zoek = useQuery("zoek") ?? ""

  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set(COLUMNS.map((c) => c.key)))
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "sold", dir: "desc" })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"new" | "import" | "margin" | null>(null)
  // The rows the margin dialog works on: the selection is cleared as soon as an action starts.
  const [dialogRows, setDialogRows] = useState<ReadonlyArray<ProductRow>>([])
  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS, () => setPage(1))
  // The shell's Nieuw menu and ⌘K open it with `?nieuw=1`.
  const asked = useQuery("nieuw") === "1" && access.edit

  const all = productRows(view, s)
  const counts = productCounts(view, s)
  const pick = lowStockPick(all)

  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = filterRows(all, filter, FIELDS, "2026-11-23").filter((r) =>
      q === "" || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
    )
    const val = (r: ProductRow) =>
      sort.key === "price"
        ? r.price
        : sort.key === "margin"
        ? r.margin
        : sort.key === "stock"
        ? r.stock
        : sort.key === "sold"
        ? r.sold
        : sort.key === "rate"
        ? r.rate
        : 0
    const dir = sort.dir === "asc" ? 1 : -1
    return out.toSorted((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name, "nl") : val(a) - val(b)) * dir)
  }, [all, zoek, filter, sort])

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const picked = rows.filter((r) => selected.has(r.id))
  const allOn = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))
  const someOn = pageRows.some((r) => selected.has(r.id))
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)
  /** A category opens the list cut to it, the other filters kept. */
  const openCategory = (c: Category) => {
    const rest = updateNode(
      filter,
      filter.id,
      (g) =>
        g.kind === "group"
          ? { ...g, children: g.children.filter((n) => n.kind !== "rule" || n.field !== "categorie") }
          : g
    )
    setFilter(appendTo(rest, rest.id, rule(CATEGORY_FIELD, "any", [c])))
    setQuery({ indeling: null })
  }

  const EDIT = { area: "products", level: 2 } as const
  /** One list for the bar, the Acties menu and the keys; each says which ticked products it fits. */
  const actions: ReadonlyArray<RowAction<ProductRow>> = [
    {
      id: "marges",
      label: "Marges herberekenen",
      icon: <BadgePercent />,
      bar: true,
      shortcut: "m",
      needs: EDIT,
      run: (list) => {
        setDialogRows(list)
        setDialog("margin")
      }
    },
    {
      id: "bijbestellen",
      label: "Bijbestelling aanvragen",
      icon: <Truck />,
      bar: true,
      shortcut: "b",
      needs: EDIT,
      applies: needsRestock,
      run: (list) => askRestock(list)
    },
    {
      id: "actief",
      label: "Op actief zetten",
      icon: <Play />,
      group: "Status",
      needs: EDIT,
      applies: (r) => r.status !== "actief",
      run: (list) => setStatus(list, "actief")
    },
    {
      id: "concept",
      label: "Op concept zetten",
      icon: <Edit />,
      group: "Status",
      needs: EDIT,
      applies: (r) => r.status !== "concept",
      run: (list) => setStatus(list, "concept")
    },
    {
      id: "archiveren",
      label: "Archiveren",
      icon: <Archive />,
      group: "Status",
      tone: "danger",
      needs: EDIT,
      applies: (r) => r.status !== "gearchiveerd",
      run: (list) => setStatus(list, "gearchiveerd")
    },
    {
      id: "kopieren",
      label: "SKU's kopiëren",
      icon: <Copy />,
      group: "Delen",
      shortcut: "c",
      run: (list) => {
        void navigator.clipboard?.writeText(list.map((p) => p.sku).join("\n")).catch(() => undefined)
        toast({ title: `${list.length} SKU's gekopieerd` })
      }
    },
    {
      id: "csv",
      label: "CSV",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      run: () => toast({ title: "Export gestart", body: "producten.csv staat zo bij je downloads." })
    }
  ]

  if (!access.view) {
    return (
      <Page>
        <PageHead title="Producten" />
        <Denied area="products" what="de producten" />
      </Page>
    )
  }

  const meta = state === "ready"
    ? `${counts.all} producten · ${counts.actief} actief · ${counts.laag} met lage voorraad · ${counts.retour} met retour boven 10%`
    : undefined

  return (
    <Page>
      <PageHead
        title="Producten"
        meta={meta}
        actions={access.edit && state !== "loading" && state !== "error"
          ? (
            <>
              <Button icon={<Upload />} onClick={() => setDialog("import")}>Importeren</Button>
              <Button variant="primary" icon={<Plus />} onClick={() => setDialog("new")}>Nieuw product</Button>
            </>
          )
          : undefined}
      />
      {!access.edit && <ReadOnlyNotice area="products" />}

      {state === "loading" && <TableSkeleton label="Producten laden" columns={8} />}
      {state === "error" && (
        <PageError title="De producten kwamen niet binnen" detail="GET /products · 504 · shopify-sync">
          De synchronisatie met Shopify liep vast. Bestellingen komen gewoon binnen; de catalogus probeert het opnieuw.
        </PageError>
      )}
      {state === "empty" && (
        <EmptyState
          glyph={Package}
          title="Nog geen producten"
          action={access.edit
            ? (
              <Button variant="primary" icon={<Upload />} onClick={() => setDialog("import")}>
                Producten importeren
              </Button>
            )
            : undefined}
        >
          Producten komen uit je Shopify-winkel, met varianten, prijzen en voorraad. Synchroniseer ze, en vul daarna per
          product de inkoopprijs en de leverancier in.
        </EmptyState>
      )}

      {state === "ready" && (
        <div className="flex min-w-0 flex-col gap-6">
          {pick !== undefined && s.advice !== "discarded" && access.edit && (
            <section aria-label="Voorstel over voorraad" className="grid gap-x-3 sm:grid-cols-[28px_minmax(0,1fr)]">
              <span className="hidden pt-0.5 sm:flex">
                <MagnusMark size={22} />
              </span>
              <Proposal
                from={
                  <>
                    <span className="truncate font-medium text-ink-2">{ASSISTANT}</span>
                    <span className="shrink-0">· voorraad</span>
                  </>
                }
                title={`Advertenties voor ${pick.row.name} pauzeren en ${pick.row.supplierName} om een bijbestelling vragen`}
                body={`${pick.row.name} is over ongeveer ${
                  Math.round(pick.days)
                } dagen op: ${pick.row.stock} op voorraad, ${
                  decimal(pick.row.sold / 7)
                } verkocht per dag. De advertenties sturen nog kopers naar het product.`}
                read={["Voorraad per maat", "Verkoop afgelopen week", `Levertijd ${pick.row.supplierName}`]}
                where={`Meta-advertenties en een ticket voor ${pick.row.supplierName}`}
                state={s.advice}
                doneBy={ME.name.split(" ")[0] ?? ME.name}
                onChange={(next) => {
                  if (next === "done") {
                    askRestock([pick.row], {
                      title: `Advertenties voor ${pick.row.name} gepauzeerd en bijbestelling gevraagd`,
                      with: (st) => ({
                        ...st,
                        advice: "done",
                        edits: { ...st.edits, [pick.row.id]: { ...st.edits[pick.row.id], adsPaused: true } }
                      })
                    })
                  } else {
                    withUndo("Voorstel genegeerd", undefined, (st) => ({ ...st, advice: next }))
                  }
                }}
              />
            </section>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle producten" />
            {picked.length > 0
              ? (
                <SelectionBar
                  rows={picked}
                  actions={actions}
                  noun={["product", "producten"]}
                  onClear={() => setSelected(new Set())}
                />
              )
              : (
                <ListToolbar
                  start={
                    <>
                      <div className="w-full sm:w-64">
                        <SearchField
                          label="Producten zoeken"
                          value={zoek}
                          onChange={(next) => {
                            setPage(1)
                            setQuery({ zoek: next === "" ? null : next })
                          }}
                          placeholder="Zoek op naam of SKU"
                        />
                      </div>
                      <FilterRules fields={FIELDS} rows={all} value={filter} onChange={setFilter} />
                      <FilterBuilder fields={FIELDS} rows={all} value={filter} onChange={setFilter} views={VIEWS} />
                    </>
                  }
                  end={
                    <span className="flex items-center gap-2">
                      <Segmented
                        label="Indeling"
                        size="sm"
                        value={layout}
                        onChange={(next) => {
                          setPage(1)
                          setQuery({ indeling: next === "lijst" ? null : next })
                        }}
                        options={[{ value: "lijst", label: "Lijst" }, { value: "categorieen", label: "Categorieën" }]}
                      />
                      {layout === "lijst" && <ColumnPicker columns={COLUMNS} visible={visible} onChange={setVisible} />}
                    </span>
                  }
                />
              )}

            {layout === "categorieen" && rows.length > 0
              ? <Categories rows={rows} restock={s.restock} onOpen={openCategory} />
              : rows.length === 0
              ? (
                <EmptyState
                  glyph={Package}
                  size="sm"
                  title="Geen producten voor deze filters"
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
                <Table label="Producten" minWidth={980}>
                  <THead>
                    <Th width={40}>
                      <RowCheckbox
                        label="Alle producten op deze pagina kiezen"
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
                    <Th sort={sortOf("name")} onSort={() => toggleSort("name")}>Product</Th>
                    {show("status") && <Th>Status</Th>}
                    {show("price") && (
                      <Th align="right" sort={sortOf("price")} onSort={() => toggleSort("price")}>Prijs</Th>
                    )}
                    {show("cost") && <Th align="right">Inkoop</Th>}
                    {show("margin") && (
                      <Th align="right" sort={sortOf("margin")} onSort={() => toggleSort("margin")}>Marge</Th>
                    )}
                    {show("stock") && (
                      <Th align="right" sort={sortOf("stock")} onSort={() => toggleSort("stock")}>Voorraad</Th>
                    )}
                    {show("sold") && (
                      <Th align="right" sort={sortOf("sold")} onSort={() => toggleSort("sold")}>Verkocht, 16–22 nov</Th>
                    )}
                    {show("rate") && (
                      <Th align="right" sort={sortOf("rate")} onSort={() => toggleSort("rate")}>Retour</Th>
                    )}
                    {show("supplier") && <Th>Leverancier</Th>}
                  </THead>
                  <TBody>
                    {pageRows.map((r) => (
                      <Tr
                        key={r.id}
                        selected={selected.has(r.id)}
                        onOpen={() => navigate(paths.product(r.id))}
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
                        <Td header className="py-1.5">
                          <span className="flex min-w-0 flex-col">
                            <Link
                              to={paths.product(r.id)}
                              className="max-w-[18rem] truncate font-medium text-ink hover:underline"
                            >
                              {r.name}
                            </Link>
                            <span className="truncate text-2xs text-ink-3">
                              {r.sku}
                              {r.adsPaused && " · advertenties gepauzeerd"}
                              {s.restock[r.id] !== undefined && ` · bijbestelling gevraagd`}
                            </span>
                          </span>
                        </Td>
                        {show("status") && (
                          <Td>
                            <Status tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Status>
                          </Td>
                        )}
                        {show("price") && <Td figure align="right">{euro(r.price)}</Td>}
                        {show("cost") && <Td figure align="right" muted>{euro(r.cost)}</Td>}
                        {show("margin") && (
                          <Td figure align="right" className={r.margin < 0.5 ? "text-warn-ink" : undefined}>
                            {percent(r.margin)}
                          </Td>
                        )}
                        {show("stock") && (
                          <Td align="right">
                            <span className="inline-flex items-center gap-2">
                              <span className="figure text-ink">{r.stock.toLocaleString("nl-NL")}</span>
                              {r.level !== "op-voorraad" && (
                                <Status tone={STOCK[r.level].tone}>{STOCK[r.level].label}</Status>
                              )}
                            </span>
                          </Td>
                        )}
                        {show("sold") && <Td figure align="right">{r.sold.toLocaleString("nl-NL")}</Td>}
                        {show("rate") && (
                          <Td
                            figure
                            align="right"
                            className={r.rate > 0.1
                              ? "font-medium text-bad-ink"
                              : r.sold === 0
                              ? "text-ink-3"
                              : undefined}
                          >
                            {r.sold === 0 ? "—" : percent(r.rate, 1)}
                          </Td>
                        )}
                        {show("supplier") && (
                          <Td>
                            <Link
                              to={paths.supplier(r.supplierId)}
                              className="text-ink-2 hover:text-ink hover:underline"
                            >
                              {r.supplierName}
                            </Link>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            {layout === "lijst" && rows.length > PAGE && (
              <div>
                <Pagination
                  page={page}
                  pageSize={PAGE}
                  total={rows.length}
                  onChange={setPage}
                  label="Pagina's producten"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <NewProductDialog
        open={dialog === "new" || asked}
        onClose={() => {
          setDialog(null)
          setQuery({ nieuw: null })
        }}
      />
      <ImportDialog open={dialog === "import"} onClose={() => setDialog(null)} />
      <MarginDialog open={dialog === "margin"} onClose={() => setDialog(null)} picked={dialogRows} />
    </Page>
  )
}

/**
 * The catalogue by category (`/app`'s `categories-view.tsx`): how many products, how many to order
 * more of, and the average margin as a short bar. A category opens the list filtered to it.
 */
function Categories({ rows, restock, onOpen: openCategory }: {
  readonly rows: ReadonlyArray<ProductRow>
  readonly restock: Readonly<Record<string, string>>
  readonly onOpen: (category: Category) => void
}) {
  const groups = CATEGORIES.map((c: Category) => {
    const items = rows.filter((r) => r.category === c)
    const low = items.filter(needsRestock)
    return {
      category: c,
      count: items.length,
      low: low.length,
      asked: low.filter((r) => restock[r.id] !== undefined).length,
      margin: items.length === 0 ? 0 : items.reduce((n, r) => n + r.margin, 0) / items.length,
      sold: items.reduce((n, r) => n + r.sold, 0)
    }
  }).filter((g) => g.count > 0)
  return (
    <Table label="Producten per categorie" minWidth={640}>
      <THead>
        <Th>Categorie</Th>
        <Th align="right">Producten</Th>
        <Th align="right">Verkocht, 16–22 nov</Th>
        <Th align="right">Bij te bestellen</Th>
        <Th>Gemiddelde marge</Th>
      </THead>
      <TBody>
        {groups.map((g) => (
          <Tr key={g.category} onOpen={() => openCategory(g.category)}>
            <Td header>
              <button type="button" onClick={() => openCategory(g.category)} className="font-medium hover:underline">
                {g.category}
              </button>
            </Td>
            <Td figure align="right">{g.count}</Td>
            <Td figure align="right">{g.sold.toLocaleString("nl-NL")}</Td>
            <Td figure align="right" className={g.low - g.asked > 0 ? "text-warn-ink" : "text-ink-3"}>
              {g.low === 0 ? "—" : g.asked === g.low ? `${g.low} gevraagd` : g.low}
            </Td>
            <Td>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-1 w-24 overflow-hidden rounded-full bg-well">
                  <span
                    className={`block h-full rounded-full ${g.margin < 0.5 ? "bg-warn" : "bg-ink-3"}`}
                    style={{ width: `${Math.round(g.margin * 100)}%` }}
                  />
                </span>
                <span className={`figure text-sm ${g.margin < 0.5 ? "text-warn-ink" : "text-ink"}`}>
                  {percent(g.margin)}
                </span>
              </span>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

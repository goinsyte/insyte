import { useMemo, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  decimal,
  lowStockPick,
  percent,
  productCounts,
  productRows,
  qualityOf,
  STATUS,
  STOCK,
  useProductState
} from "../../fixtures/products.ts"
import type { ProductRow } from "../../fixtures/products.ts"
import { euro } from "../../fixtures/records.ts"
import type { ProductStatus } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AddFilter, ColumnPicker, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption, FilterField } from "../../ui/filters.tsx"
import { Archive, BadgePercent, Copy, Download, Edit, Package, Play, Plus, Upload } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { Proposal } from "../../ui/proposal.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { ImportDialog, MarginDialog, NewProductDialog, withUndo } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

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

/** The menu's cuts, as the address says them. */
const VIEWS: Readonly<Record<string, { readonly label: string; readonly test: (r: ProductRow) => boolean }>> = {
  actief: { label: "Actief", test: (r) => r.status === "actief" },
  concept: { label: "Concept", test: (r) => r.status === "concept" },
  gearchiveerd: { label: "Gearchiveerd", test: (r) => r.status === "gearchiveerd" },
  laag: { label: "Lage voorraad", test: (r) => r.status === "actief" && r.level !== "op-voorraad" },
  retour: { label: "Retour boven 10%", test: (r) => r.rate > 0.1 },
  toezicht: { label: "Onder toezicht", test: (r) => qualityOf(r).phase === "toezicht" }
}

type SortKey = "name" | "price" | "margin" | "stock" | "sold" | "rate"

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
  const weergave = useQuery("weergave")
  const leverancier = useQuery("leverancier")
  const zoek = useQuery("zoek") ?? ""

  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set(COLUMNS.map((c) => c.key)))
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "sold", dir: "desc" })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"new" | "import" | "margin" | null>(null)

  const all = productRows(view, s)
  const counts = productCounts(view, s)
  const pick = lowStockPick(all)
  const cut = weergave === null ? undefined : VIEWS[weergave]

  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = all.filter((r) =>
      (q === "" || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) &&
      (cut === undefined || cut.test(r)) &&
      (leverancier === null || r.supplierName === leverancier)
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
  }, [all, zoek, cut, leverancier, sort])

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const picked = all.filter((r) => selected.has(r.id))
  const allOn = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))
  const someOn = pageRows.some((r) => selected.has(r.id))
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)
  const setStatus = (status: ProductStatus) => {
    withUndo(
      `${picked.length} ${picked.length === 1 ? "product" : "producten"} op ${
        STATUS[status].label.toLowerCase()
      } gezet`,
      undefined,
      (st) => ({
        ...st,
        edits: { ...st.edits, ...Object.fromEntries(picked.map((p) => [p.id, { ...st.edits[p.id], status }])) }
      })
    )
    setSelected(new Set())
  }

  const FIELDS: ReadonlyArray<FilterField> = [
    { key: "weergave", label: "Weergave", options: Object.values(VIEWS).map((v) => v.label) },
    { key: "leverancier", label: "Leverancier", options: [...new Set(all.map((r) => r.supplierName))].toSorted() }
  ]
  const active = new Set([
    ...(cut === undefined ? [] : [`weergave:${cut.label}`]),
    ...(leverancier === null ? [] : [`leverancier:${leverancier}`])
  ])
  const addFilter = (field: string, value: string) => {
    setPage(1)
    if (field === "weergave") {
      setQuery({ weergave: Object.entries(VIEWS).find(([, v]) => v.label === value)?.[0] ?? null })
    } else setQuery({ leverancier: value })
  }

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
                    withUndo(
                      `Advertenties voor ${pick.row.name} gepauzeerd`,
                      `Bijbestelling gevraagd bij ${pick.row.supplierName}.`,
                      (st) => ({
                        ...st,
                        advice: "done",
                        edits: { ...st.edits, [pick.row.id]: { ...st.edits[pick.row.id], adsPaused: true } }
                      })
                    )
                  } else {
                    withUndo("Voorstel genegeerd", undefined, (st) => ({ ...st, advice: next }))
                  }
                }}
              />
            </section>
          )}

          <div className="flex min-w-0 flex-col">
            {selected.size > 0
              ? (
                <SelectionBar
                  count={selected.size}
                  noun={["product", "producten"]}
                  onClear={() => setSelected(new Set())}
                >
                  {access.edit && (
                    <SelectionAction icon={<BadgePercent />} onClick={() => setDialog("margin")}>
                      Marges herberekenen
                    </SelectionAction>
                  )}
                  {access.edit && (
                    <SelectionAction icon={<Play />} onClick={() => setStatus("actief")}>
                      Op actief zetten
                    </SelectionAction>
                  )}
                  {access.edit && (
                    <SelectionAction icon={<Edit />} onClick={() => setStatus("concept")}>
                      Op concept zetten
                    </SelectionAction>
                  )}
                  {access.edit && (
                    <SelectionAction
                      icon={<Archive />}
                      tone="danger"
                      onClick={() => setStatus("gearchiveerd")}
                    >
                      Archiveren
                    </SelectionAction>
                  )}
                  <SelectionAction
                    icon={<Copy />}
                    onClick={() => {
                      void navigator.clipboard?.writeText(picked.map((p) => p.sku).join("\n")).catch(() => undefined)
                      toast({ title: `${picked.length} SKU's gekopieerd` })
                    }}
                  >
                    SKU's kopiëren
                  </SelectionAction>
                  <SelectionAction
                    icon={<Download />}
                    onClick={() => toast({ title: "Export gestart", body: "producten.csv staat zo bij je downloads." })}
                  >
                    CSV
                  </SelectionAction>
                </SelectionBar>
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
                      {cut !== undefined && (
                        <FilterChip
                          field="Weergave"
                          value={cut.label}
                          onRemove={() => setQuery({ weergave: null })}
                        />
                      )}
                      {leverancier !== null && (
                        <FilterChip
                          field="Leverancier"
                          value={leverancier}
                          onRemove={() => setQuery({ leverancier: null })}
                        />
                      )}
                      <AddFilter fields={FIELDS} active={active} onAdd={addFilter} />
                    </>
                  }
                  end={<ColumnPicker columns={COLUMNS} visible={visible} onChange={setVisible} />}
                />
              )}

            {rows.length === 0
              ? (
                <EmptyState
                  glyph={Package}
                  size="sm"
                  title="Geen producten voor deze filters"
                  className="py-14"
                  action={
                    <Button size="sm" onClick={() => setQuery({ weergave: null, leverancier: null, zoek: null })}>
                      Filters wissen
                    </Button>
                  }
                >
                  Pas de zoekterm of de filters aan, of wis ze.
                </EmptyState>
              )
              : (
                <Table label="Producten" minWidth={980} className="mt-1">
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
            {rows.length > PAGE && (
              <div className="pt-3">
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

      <NewProductDialog open={dialog === "new"} onClose={() => setDialog(null)} />
      <ImportDialog open={dialog === "import"} onClose={() => setDialog(null)} />
      <MarginDialog open={dialog === "margin"} onClose={() => setDialog(null)} picked={picked} />
    </Page>
  )
}

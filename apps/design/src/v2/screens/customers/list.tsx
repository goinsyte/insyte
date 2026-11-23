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
import type { CustomerRow, Segment } from "../../fixtures/customers.ts"
import { euro, when } from "../../fixtures/records.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { RecordLabel, Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AddFilter, ColumnPicker, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { ColumnOption, FilterField } from "../../ui/filters.tsx"
import { Copy, Download, GitMerge, Mail, Plus, Send, TagGlyph, Ticket, Users } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { KlaviyoDialog, MergeReview, NewCustomerDialog, TagDialog } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

const PAGE = 25

const SEGMENTS: ReadonlyArray<{ readonly id: Segment | "vip"; readonly label: string }> = [
  { id: "vip", label: "VIP" },
  { id: "trouw", label: "Trouw" },
  { id: "nieuw", label: "Nieuw" },
  { id: "risico", label: "Risico" },
  { id: "dubbel", label: "Dubbel" }
]

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
  const support = useAccess("support")
  const data = useAccess("data")
  const state = dataState(view)
  const segment = useQuery("segment")
  const land = useQuery("land")
  const zoek = useQuery("zoek") ?? ""
  const reviewing = useQuery("samenvoegen") === "1"

  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set(COLUMNS.map((c) => c.key)))
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "value", dir: "desc" })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"new" | "tag" | "klaviyo" | null>(null)
  const [mergeGroups, setMergeGroups] = useState<ReturnType<typeof duplicateGroups> | null>(null)

  const all = customerRows(view, s)
  const counts = customerCounts(view, s)
  const groups = duplicateGroups(s)

  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = all.filter((r) =>
      (q === "" || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) &&
      (segment === null || (segment === "vip" ? r.tags.includes("vip") : r.segment === segment)) &&
      (land === null || COUNTRY[r.country] === land)
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
  }, [all, zoek, segment, land, sort])

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const picked = all.filter((r) => selected.has(r.id))
  const allOn = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))
  const someOn = pageRows.some((r) => selected.has(r.id))
  const show = (key: string) => visible.has(key)
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)

  const FIELDS: ReadonlyArray<FilterField> = [
    { key: "segment", label: "Status", options: SEGMENTS.map((x) => x.label) },
    { key: "land", label: "Land", options: [...new Set(all.map((r) => COUNTRY[r.country]))].toSorted() }
  ]
  const active = new Set([
    ...(segment === null ? [] : [`segment:${SEGMENTS.find((x) => x.id === segment)?.label ?? ""}`]),
    ...(land === null ? [] : [`land:${land}`])
  ])
  const addFilter = (field: string, value: string) => {
    setPage(1)
    if (field === "segment") setQuery({ segment: SEGMENTS.find((x) => x.label === value)?.id ?? null })
    else setQuery({ land: value })
  }
  const clearFilters = () => {
    setPage(1)
    setQuery({ segment: null, land: null, zoek: null })
  }

  const openReview = (g = groups) => {
    setMergeGroups(g)
    setQuery({ samenvoegen: "1" })
  }
  const closeReview = () => {
    setMergeGroups(null)
    setQuery({ samenvoegen: null })
  }
  const mergePicked = () => {
    if (picked.length >= 2) {
      openReview([{
        key: picked.map((p) => p.id).join("+"),
        ids: picked.map((p) => p.id),
        match: "zelfde naam en land"
      }])
      return
    }
    const g = groups.find((x) => picked[0] !== undefined && x.ids.includes(picked[0].id))
    if (g === undefined) {
      toast({ title: "Kies twee of meer profielen om samen te voegen, of bekijk de dubbele profielen." })
    } else openReview([g])
  }

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

          <div className="flex min-w-0 flex-col">
            {selected.size > 0
              ? (
                <SelectionBar count={selected.size} noun={["klant", "klanten"]} onClear={() => setSelected(new Set())}>
                  {access.edit && (
                    <SelectionAction
                      icon={<Mail />}
                      onClick={() =>
                        toast({
                          title: "Je mailprogramma opent",
                          body: `${
                            counted(picked.length, "adres", "adressen")
                          } in bcc. Er gaat niets uit voor jij op verzenden drukt.`
                        })}
                    >
                      E-mailen
                    </SelectionAction>
                  )}
                  {access.edit && (
                    <SelectionAction icon={<TagGlyph />} onClick={() => setDialog("tag")}>
                      Label toevoegen
                    </SelectionAction>
                  )}
                  {access.manage && (
                    <SelectionAction icon={<GitMerge />} onClick={mergePicked}>Samenvoegen</SelectionAction>
                  )}
                  {access.edit && support.edit && (
                    <SelectionAction
                      icon={<Ticket />}
                      onClick={() =>
                        toast({
                          title: `${counted(picked.length, "ticket", "tickets")} geopend`,
                          body: "‘Opvolgen met …’ per klant, op het bord van de inbox.",
                          tone: "good",
                          action: { label: "Openen", onClick: () => navigate(paths.tickets) }
                        })}
                    >
                      Ticket per klant
                    </SelectionAction>
                  )}
                  {access.edit && (
                    <SelectionAction icon={<Send />} onClick={() => setDialog("klaviyo")}>Naar Klaviyo</SelectionAction>
                  )}
                  <SelectionAction
                    icon={<Copy />}
                    onClick={() => {
                      void navigator.clipboard?.writeText(picked.map((p) => p.email).join(", ")).catch(() => undefined)
                      toast({ title: `${counted(picked.length, "adres", "adressen")} gekopieerd` })
                    }}
                  >
                    E-mailadressen kopiëren
                  </SelectionAction>
                  {data.view && (
                    <SelectionAction
                      icon={<Download />}
                      onClick={() => toast({ title: "Export gestart", body: "klanten.csv staat zo bij je downloads." })}
                    >
                      CSV
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
                          label="Klanten zoeken"
                          value={zoek}
                          onChange={(next) => {
                            setPage(1)
                            setQuery({ zoek: next === "" ? null : next })
                          }}
                          placeholder="Zoek op naam of e-mail"
                        />
                      </div>
                      {segment !== null && (
                        <FilterChip
                          field="Status"
                          value={SEGMENTS.find((x) => x.id === segment)?.label ?? segment}
                          onRemove={() => setQuery({ segment: null })}
                        />
                      )}
                      {land !== null && (
                        <FilterChip
                          field="Land"
                          value={land}
                          onRemove={() => setQuery({ land: null })}
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
                <Table label="Klanten" minWidth={920} className="mt-1">
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
              <div className="pt-3">
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

      <NewCustomerDialog open={dialog === "new"} onClose={() => setDialog(null)} />
      <TagDialog open={dialog === "tag"} onClose={() => setDialog(null)} picked={picked} />
      <KlaviyoDialog open={dialog === "klaviyo"} onClose={() => setDialog(null)} picked={picked} />
      <MergeReview open={reviewing && access.manage} onClose={closeReview} groups={mergeGroups ?? groups} />
    </Page>
  )
}

import { useMemo, useState } from "react"
import { decimal, PORTAL, supplierCounts, supplierRows, useSupplierState, VIA } from "../../fixtures/suppliers.ts"
import type { SupplierRow } from "../../fixtures/suppliers.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Link } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { AddFilter, FilterChip, ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import type { FilterField } from "../../ui/filters.tsx"
import { Download, Factory, Mail, Pause, Play, UserPlus } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import type { Sort } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { InviteDialog, MailDialog, withUndo } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

/** The menu's cuts, as the address says them. */
export const VIEWS: Readonly<Record<string, { readonly label: string; readonly test: (r: SupplierRow) => boolean }>> = {
  vertraagd: { label: "Vertraagd", test: (r) => r.late.length > 0 },
  uitgenodigd: { label: "Uitgenodigd", test: (r) => r.portal === "uitgenodigd" },
  api: { label: "Via API", test: (r) => r.apiConnected }
}

type SortKey = "name" | "late" | "lead" | "onTime"

/**
 * Leveranciers (`/app/suppliers`): who makes what, and whether they keep their word. Lead time is
 * read against what they promised, late orders are counted per supplier, and how orders reach them
 * (API, portal or e-mail) sits beside the portal's state. A row opens the supplier's page.
 */
export function SuppliersList() {
  const view = useView()
  const st = useSupplierState()
  const access = useAccess("suppliers")
  const state = dataState(view)
  const weergave = useQuery("weergave")
  const zoek = useQuery("zoek") ?? ""
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<Sort, null> }>({ key: "late", dir: "desc" })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<"invite" | "mail" | null>(null)

  const all = supplierRows(view, st)
  const counts = supplierCounts(view, st)
  const cut = weergave === null ? undefined : VIEWS[weergave]
  const rows = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const out = all.filter((r) =>
      (q === "" || r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q))
      && (cut === undefined || cut.test(r))
    )
    const val = (r: SupplierRow) =>
      sort.key === "late" ? r.late.length : sort.key === "lead" ? r.leadDays - r.promiseDays : r.onTime ?? 2
    const dir = sort.dir === "asc" ? 1 : -1
    return out.toSorted((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name, "nl") : val(a) - val(b)) * dir)
  }, [all, zoek, cut, sort])
  const picked = all.filter((r) => selected.has(r.id))
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }))
  const sortOf = (key: SortKey) => (sort.key === key ? sort.dir : null)
  const pause = (paused: boolean) => {
    withUndo(
      paused
        ? `${picked.length} ${picked.length === 1 ? "leverancier" : "leveranciers"} gepauzeerd`
        : `${picked.length} ${picked.length === 1 ? "leverancier" : "leveranciers"} hervat`,
      paused ? "Nieuwe bestellingen wachten tot je ze hervat." : undefined,
      (s) => ({ edits: { ...s.edits, ...Object.fromEntries(picked.map((r) => [r.id, { ...s.edits[r.id], paused }])) } })
    )
    setSelected(new Set())
  }
  const FIELDS: ReadonlyArray<FilterField> = [
    { key: "weergave", label: "Weergave", options: Object.values(VIEWS).map((v) => v.label) }
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
            <Button variant="primary" icon={<UserPlus />} onClick={() => setDialog("invite")}>
              Leverancier uitnodigen
            </Button>
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
        <div className="flex min-w-0 flex-col">
          {selected.size > 0
            ? (
              <SelectionBar
                count={selected.size}
                noun={["leverancier", "leveranciers"]}
                onClear={() => setSelected(new Set())}
              >
                <SelectionAction icon={<Mail />} onClick={() => setDialog("mail")}>E-mailen</SelectionAction>
                {access.edit && (
                  <SelectionAction icon={<Pause />} onClick={() => pause(true)}>Pauzeren</SelectionAction>
                )}
                {access.edit && picked.some((r) => r.paused) && (
                  <SelectionAction
                    icon={<Play />}
                    onClick={() => pause(false)}
                  >
                    Hervatten
                  </SelectionAction>
                )}
                <SelectionAction
                  icon={<Download />}
                  onClick={() =>
                    toast({ title: "Export gestart", body: "leveranciers.csv staat zo bij je downloads." })}
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
                        label="Leveranciers zoeken"
                        value={zoek}
                        onChange={(next) => setQuery({ zoek: next === "" ? null : next })}
                        placeholder="Zoek op naam of contactpersoon"
                      />
                    </div>
                    {cut !== undefined && (
                      <FilterChip
                        field="Weergave"
                        value={cut.label}
                        onRemove={() => setQuery({ weergave: null })}
                      />
                    )}
                    <AddFilter
                      fields={FIELDS}
                      active={new Set(cut === undefined ? [] : [`weergave:${cut.label}`])}
                      onAdd={(_, value) =>
                        setQuery({ weergave: Object.entries(VIEWS).find(([, v]) => v.label === value)?.[0] ?? null })}
                    />
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
                  <Button size="sm" onClick={() => setQuery({ weergave: null, zoek: null })}>Filters wissen</Button>
                }
              >
                Pas de zoekterm of de filters aan, of wis ze.
              </EmptyState>
            )
            : (
              <Table label="Leveranciers" minWidth={920} className="mt-1">
                <THead>
                  <Th width={40}>
                    <RowCheckbox
                      label="Alle leveranciers kiezen"
                      checked={allOn}
                      indeterminate={!allOn && rows.some((r) => selected.has(r.id))}
                      onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </Th>
                  <Th sort={sortOf("name")} onSort={() => toggleSort("name")}>Leverancier</Th>
                  <Th align="right">Producten</Th>
                  <Th align="right">Open</Th>
                  <Th align="right" sort={sortOf("late")} onSort={() => toggleSort("late")}>Te laat</Th>
                  <Th align="right" sort={sortOf("lead")} onSort={() => toggleSort("lead")}>Levertijd</Th>
                  <Th align="right" sort={sortOf("onTime")} onSort={() => toggleSort("onTime")}>Op tijd</Th>
                  <Th>Bestellingen via</Th>
                  <Th>Portaal</Th>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const slow = r.leadDays > r.promiseDays
                    return (
                      <Tr key={r.id} selected={selected.has(r.id)} onOpen={() => navigate(paths.supplier(r.id))}>
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
      <MailDialog
        open={dialog === "mail"}
        onClose={() => {
          setDialog(null)
          setSelected(new Set())
        }}
        to={picked.map((r) => ({ name: r.name, email: r.email }))}
      />
    </Page>
  )
}

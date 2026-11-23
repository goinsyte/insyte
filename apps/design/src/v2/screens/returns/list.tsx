import { useMemo, useState } from "react"
import { money, stamp } from "../../fixtures/order-desk.ts"
import { customer, product } from "../../fixtures/records.ts"
import {
  amountOf,
  changeReturns,
  deadlineOf,
  moveReturn,
  pastDeadline,
  REASON_LABEL,
  RESOLUTION_LABEL,
  restoreReturns,
  returnsNow,
  returnsOf,
  STATUS,
  useReturnsState,
  weekAuroraRefunds,
  weekExchanges,
  weekRefunds
} from "../../fixtures/returns.ts"
import type { ReturnRecord, ReturnStatus } from "../../fixtures/returns.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { exportCsv, undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import { ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { LoadError, TableSkeleton } from "../../ui/data.tsx"
import { ListToolbar, SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import { Check, Download, Returns, Settings } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { dataState, useView } from "../../view.ts"

/*
 * Retouren (`/app`'s `_admin/returns/index.tsx`, `returns-screen.tsx`): every return and claim, in
 * the views the work goes through. Open is what still needs a person or a parcel; the tabs cut it by
 * the step. The week's refunds sit under the head in one sentence, the way Analyse counts them.
 */

export type View = "open" | "beoordelen" | "onderweg" | "afhandelen" | "gesloten"

export const VIEWS: Readonly<Record<View, { readonly label: string; readonly statuses: ReadonlyArray<ReturnStatus> }>> =
  {
    open: { label: "Open", statuses: ["te-beoordelen", "wacht-op-pakket", "onderweg", "ontvangen", "klaar"] },
    beoordelen: { label: "Te beoordelen", statuses: ["te-beoordelen"] },
    onderweg: { label: "Wacht op pakket", statuses: ["wacht-op-pakket", "onderweg"] },
    afhandelen: { label: "Af te handelen", statuses: ["ontvangen", "klaar"] },
    gesloten: { label: "Afgehandeld", statuses: ["afgehandeld", "afgewezen"] }
  }

const PAGE_SIZE = 50

/** "Valt te klein → M" or "Terugbetalen". */
export const wishOf = (r: ReturnRecord) =>
  r.requested === "ruilen" && r.exchangeTo !== undefined && r.exchangeTo !== r.size
    ? `Ruilen naar ${r.exchangeTo}`
    : RESOLUTION_LABEL[r.requested]

export function ReturnsList() {
  const view = useView()
  const access = useAccess("returns")
  const state = dataState(view)
  const s = useReturnsState()
  const tab = (useQuery("weergave") ?? "open") as View
  const q = useQuery("q") ?? ""
  const page = Math.max(1, Number(useQuery("pagina") ?? "1") || 1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const all = returnsOf(s)
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(VIEWS) as ReadonlyArray<View>).map((v) => [
          v,
          all.filter((r) => VIEWS[v].statuses.includes(r.status)).length
        ])
      ) as Record<View, number>,
    [all]
  )
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "")
    return all
      .filter((r) => (VIEWS[tab] ?? VIEWS.open).statuses.includes(r.status))
      .filter((r) =>
        needle === "" ||
        `${r.number} ${r.orderNumber} ${customer(r.customerId)?.name ?? ""} ${product(r.productId)?.name ?? ""}`
          .toLowerCase().includes(needle)
      )
      // What has to be looked at first: past its deadline, then the oldest request.
      .toSorted((
        a,
        b
      ) => (tab === "gesloten"
        ? b.createdAt - a.createdAt
        : Number(pastDeadline(b)) - Number(pastDeadline(a)) || a.createdAt - b.createdAt)
      )
  }, [all, tab, q])

  if (!access.view) {
    return (
      <Page>
        <Denied area="returns" what="de retouren" />
      </Page>
    )
  }

  const review = all.filter((r) => r.status === "te-beoordelen")
  const late = review.filter(pastDeadline).length
  const waiting = counts.onderweg
  const head = (
    <PageHead
      title="Retouren"
      meta={state === "ready"
        ? `${review.length} te beoordelen · ${late} over de deadline · ${waiting} wachten op pakket`
        : state === "empty"
        ? "0 retouren"
        : undefined}
      actions={
        <ButtonLink to={paths.settings("retouren")} variant="ghost" icon={<Settings />}>Retourinstellingen</ButtonLink>
      }
    />
  )

  if (state === "loading") {
    return (
      <Page>
        {head}
        <TableSkeleton columns={[56, 56, 140, 170, 110, 110, 90]} />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page>
        {head}
        <LoadError what="De retouren" detail="GET /returns · 504 · req_7a1e09" />
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page>
        {head}
        <EmptyState
          glyph={Returns}
          title="Nog geen retouren"
          action={<ButtonLink to={paths.returnPortal("northwind-eu")}>Retourportaal bekijken</ButtonLink>}
        >
          Een retour komt hier binnen zodra een klant er een aanvraagt in het retourportaal, of jij er een start vanaf
          een bestelling.
        </EmptyState>
      </Page>
    )
  }

  const last = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const at = Math.min(page, last)
  const pageRows = rows.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE)
  const picked = rows.filter((r) => selected.has(r.id))
  const approvable = picked.filter((r) => r.status === "te-beoordelen" && r.proposalId === undefined)
  const refunds = weekRefunds().length
  const aurora = weekAuroraRefunds().length
  const tooSmall = weekRefunds().filter((r) => r.reason === "te-klein").length

  const approve = (list: ReadonlyArray<ReturnRecord>) => {
    const before = changeReturns((st) =>
      list.reduce(
        (acc, r) =>
          moveReturn(
            acc,
            r,
            {
              status: "wacht-op-pakket",
              label: {
                carrier: "PostNL",
                tracking: `3SNWD${String(r.number.slice(2)).padStart(5, "0")}`,
                madeAt: returnsNow(),
                sentAt: returnsNow()
              }
            },
            "Goedgekeurd; retourlabel naar de klant gestuurd",
            ME.name
          ),
        st
      )
    )
    setSelected(new Set())
    undoable(
      `${list.length === 1 ? list[0]?.number ?? "" : `${list.length} retouren`} goedgekeurd`,
      () => restoreReturns(before),
      "De klant krijgt het retourlabel na de verzendtijd van 30 seconden."
    )
  }

  return (
    <Page>
      {head}
      {!access.edit && <ReadOnlyNotice area="returns" />}
      <p className="-mt-4 max-w-[70ch] text-sm text-pretty text-ink-2">
        Vorige week <span className="figure">{refunds}</span> terugbetalingen, <span className="figure">{aurora}</span>
        {" "}
        daarvan voor de{" "}
        <Link to={paths.product("aurora-hooded-fleece")} className="text-ink hover:underline">
          Aurora Hooded Fleece
        </Link>, meestal omdat hij te klein valt (<span className="figure">{tooSmall}</span> keer).{" "}
        <span className="figure">{weekExchanges().length}</span> klanten ruilden in plaats van hun geld terug te vragen.
      </p>
      <div className="flex flex-col gap-3">
        <Tabs
          label="Weergaven"
          value={tab}
          onChange={(v) => {
            setSelected(new Set())
            setQuery({ weergave: v === "open" ? null : v, pagina: null })
          }}
          tabs={(Object.keys(VIEWS) as ReadonlyArray<View>).map((v) => ({
            value: v,
            label: VIEWS[v].label,
            count: counts[v]
          }))}
        />
        {picked.length > 0
          ? (
            <SelectionBar count={picked.length} noun={["retour", "retouren"]} onClear={() => setSelected(new Set())}>
              {access.edit && approvable.length > 0 && (
                <SelectionAction
                  icon={<Check />}
                  onClick={() => approve(approvable)}
                >
                  Goedkeuren
                </SelectionAction>
              )}
              <SelectionAction
                icon={<Download />}
                onClick={() =>
                  exportCsv(
                    "retouren",
                    ["Retour", "Bestelling", "Klant", "Artikel", "Reden", "Wens", "Status", "Bedrag"],
                    picked.map((r) => [
                      r.number,
                      `#${r.orderNumber}`,
                      customer(r.customerId)?.name ?? "",
                      `${product(r.productId)?.name ?? r.productId} ${r.size}`,
                      REASON_LABEL[r.reason],
                      wishOf(r),
                      STATUS[r.status].label,
                      amountOf(r).toLocaleString("nl-NL", { minimumFractionDigits: 2 })
                    ])
                  )}
              >
                Exporteren
              </SelectionAction>
            </SelectionBar>
          )
          : (
            <ListToolbar
              start={
                <div className="w-full sm:w-72">
                  <SearchField
                    label="Retouren zoeken"
                    value={q}
                    onChange={(v) => setQuery({ q: v === "" ? null : v, pagina: null })}
                    placeholder="Zoek op retour, bestelling of klant"
                  />
                </div>
              }
            />
          )}
        {rows.length === 0
          ? (
            <EmptyState
              size="sm"
              glyph={Returns}
              title={q === "" ? `Niets ${VIEWS[tab].label.toLowerCase()}` : "Geen retouren voor deze zoekopdracht"}
              className="py-14"
            >
              {q === ""
                ? "Als er iets bij komt, staat het hier."
                : "Zoek op een retournummer, een bestelnummer of de naam van de klant."}
            </EmptyState>
          )
          : (
            <>
              <Table label={VIEWS[tab].label} minWidth={860}>
                <THead>
                  <Th width={40}>
                    <RowCheckbox
                      label="Alles op deze pagina kiezen"
                      checked={pageRows.every((r) => selected.has(r.id))}
                      indeterminate={pageRows.some((r) => selected.has(r.id)) &&
                        !pageRows.every((r) => selected.has(r.id))}
                      onChange={(on) => setSelected(on ? new Set(pageRows.map((r) => r.id)) : new Set())}
                    />
                  </Th>
                  <Th>Retour</Th>
                  <Th>Bestelling</Th>
                  <Th>Klant</Th>
                  <Th>Artikel</Th>
                  <Th>Reden</Th>
                  <Th>Wens</Th>
                  <Th>Status</Th>
                  <Th align="right">{tab === "gesloten" ? "Bedrag" : "Aangevraagd"}</Th>
                </THead>
                <TBody>
                  {pageRows.map((r) => {
                    const overdue = pastDeadline(r)
                    return (
                      <Tr key={r.id} selected={selected.has(r.id)} onOpen={() => navigate(paths.return(r.id))}>
                        <Td>
                          <RowCheckbox
                            label={`${r.number} kiezen`}
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
                          <Link to={paths.return(r.id)} className="figure font-medium text-ink hover:underline">
                            {r.number}
                          </Link>
                          {r.kind === "claim" && <span className="block text-2xs text-ink-3">Claim</span>}
                        </Td>
                        <Td>
                          <Link to={paths.order(r.orderNumber)} className="figure text-ink-2 hover:underline">
                            #{r.orderNumber}
                          </Link>
                        </Td>
                        <Td>
                          <span className="block max-w-40 truncate text-ink">{customer(r.customerId)?.name}</span>
                        </Td>
                        <Td muted>
                          <span className="block max-w-52 truncate">
                            {product(r.productId)?.name ?? r.productId} · {r.size}
                          </span>
                        </Td>
                        <Td muted>{REASON_LABEL[r.reason]}</Td>
                        <Td muted>{r.resolution === undefined ? wishOf(r) : RESOLUTION_LABEL[r.resolution.kind]}</Td>
                        <Td>
                          {overdue
                            ? <Status tone="bad">Over de deadline</Status>
                            : <Status tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Status>}
                          {r.proposalId !== undefined && r.status === "te-beoordelen" && (
                            <span className="block text-2xs text-ink-3">Voorstel wacht</span>
                          )}
                        </Td>
                        <Td figure muted>
                          {tab === "gesloten"
                            ? r.resolution === undefined ? "—" : money(r.resolution.amount)
                            : r.status === "te-beoordelen"
                            ? `vóór ${stamp(new Date(deadlineOf(r)))}`
                            : stamp(new Date(r.createdAt))}
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
              <Pagination
                page={at}
                pageSize={PAGE_SIZE}
                total={rows.length}
                onChange={(p) => setQuery({ pagina: p === 1 ? null : String(p) })}
              />
            </>
          )}
      </div>
    </Page>
  )
}

import { useMemo, useState } from "react"
import { money, stamp } from "../../fixtures/order-desk.ts"
import { customer, product } from "../../fixtures/records.ts"
import {
  amountOf,
  changeReturns,
  deadlineOf,
  itemsOf,
  moveReturn,
  pastDeadline,
  photoMissing,
  REASON_LABEL,
  REJECT_REASONS,
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
import { DEMO_NOW, ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { exportCsv, undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RadioGroup, RowCheckbox } from "../../ui/checkbox.tsx"
import { LoadError, TableSkeleton } from "../../ui/data.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { countRules, emptyGroup, sameFilter } from "../../ui/filter-model.ts"
import { FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import { Check, Download, Returns, Send, Settings, User, XCircle } from "../../ui/icons.tsx"
import { Field, SearchField, Textarea } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { filterRows, isoDay, rule, useListFilter, where } from "../orders/list-filter.ts"
import type { Address, ListField } from "../orders/list-filter.ts"

/*
 * Retouren (`/app`'s `_admin/returns/index.tsx`, `returns-screen.tsx`): every return and claim, in
 * the views the work goes through. Open is what still needs a person or a parcel; the views cut it by
 * the step, and the filter by anything else. The week's refunds sit under the head in one sentence,
 * the way Analyse counts them.
 */

const STATUS_FIELD: ListField<ReturnRecord> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(STATUS).map((x) => x.label),
  get: (r) => STATUS[r.status].label
}
const LATE_FIELD: ListField<ReturnRecord> = {
  key: "deadline",
  label: "Over de deadline",
  type: "option",
  options: ["Ja", "Nee"],
  get: (r) => (pastDeadline(r) ? "Ja" : "Nee")
}

const FIELDS: ReadonlyArray<ListField<ReturnRecord>> = [
  STATUS_FIELD,
  LATE_FIELD,
  {
    key: "soort",
    label: "Soort",
    type: "option",
    options: ["Retour", "Claim"],
    get: (r) => (r.kind === "claim" ? "Claim" : "Retour")
  },
  {
    key: "reden",
    label: "Reden",
    type: "option",
    options: Object.values(REASON_LABEL),
    get: (r) => REASON_LABEL[r.reason]
  },
  {
    key: "wens",
    label: "Wens",
    type: "option",
    options: Object.values(RESOLUTION_LABEL),
    get: (r) => RESOLUTION_LABEL[r.requested]
  },
  { key: "artikel", label: "Artikel", type: "option", get: (r) => product(r.productId)?.name ?? r.productId },
  { key: "toegewezen", label: "Toegewezen aan", type: "option", get: (r) => r.assignee ?? "" },
  { key: "bedrag", label: "Bedrag", type: "number", get: amountOf },
  { key: "aangevraagd", label: "Aangevraagd", type: "date", get: (r) => isoDay(r.createdAt) },
  { key: "klant", label: "Klant", type: "text", get: (r) => customer(r.customerId)?.name ?? "" }
]

const step = (...statuses: ReadonlyArray<ReturnStatus>) =>
  where("and", rule(STATUS_FIELD, "any", statuses.map((x) => STATUS[x].label)))
const CLOSED: ReadonlyArray<ReturnStatus> = ["afgehandeld", "afgewezen"]
const OPEN = where("and", rule(STATUS_FIELD, "none", CLOSED.map((x) => STATUS[x].label)))
const STEPS = {
  beoordelen: step("te-beoordelen"),
  onderweg: step("wacht-op-pakket", "onderweg"),
  afhandelen: step("ontvangen", "klaar"),
  gesloten: step(...CLOSED)
}

/** The menu's steps (`?weergave=beoordelen`); without one the list is the open returns. */
const ADDRESS: Address = {
  params: [{ param: "status", field: "status" }],
  cuts: { param: "weergave", filters: { open: OPEN, ...STEPS }, fallback: "open" }
}

const VIEWS = "retouren"
seedViews(VIEWS, [
  { name: "Open", pinned: true, filter: OPEN },
  { name: "Te beoordelen", pinned: false, filter: STEPS.beoordelen },
  { name: "Wacht op pakket", pinned: false, filter: STEPS.onderweg },
  { name: "Af te handelen", pinned: false, filter: STEPS.afhandelen },
  { name: "Afgehandeld", pinned: false, filter: STEPS.gesloten }
])

const approvable = (r: ReturnRecord) => r.status === "te-beoordelen" && r.proposalId === undefined
const closed = (r: ReturnRecord) => CLOSED.includes(r.status)

const PAGE_SIZE = 50

/** "Valt te klein → M" or "Terugbetalen". */
export const wishOf = (r: ReturnRecord) =>
  r.requested === "ruilen" && r.exchangeTo !== undefined && r.exchangeTo !== r.size
    ? `Ruilen naar ${r.exchangeTo}`
    : RESOLUTION_LABEL[r.requested]

/** "R-881", or "3 retouren". */
const many = (list: ReadonlyArray<ReturnRecord>) =>
  list.length === 1 ? list[0]?.number ?? "" : `${list.length} retouren`

export function ReturnsList() {
  const view = useView()
  const access = useAccess("returns")
  const state = dataState(view)
  const s = useReturnsState()
  const q = useQuery("q") ?? ""
  const page = Math.max(1, Number(useQuery("pagina") ?? "1") || 1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [rejecting, setRejecting] = useState<ReadonlyArray<ReturnRecord> | null>(null)
  const [rejectWhy, setRejectWhy] = useState(REJECT_REASONS[0] ?? "")
  const [rejectOwn, setRejectOwn] = useState("")

  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS, () => setSelected(new Set()))
  const all = returnsOf(s)
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "")
    return filterRows(all, filter, FIELDS, DEMO_NOW.date.getTime())
      .filter((r) =>
        needle === "" ||
        `${r.number} ${r.orderNumber} ${customer(r.customerId)?.name ?? ""} ${product(r.productId)?.name ?? ""}`
          .toLowerCase().includes(needle)
      )
      // What has to be looked at first: open before closed, past its deadline, then the oldest request;
      // the closed ones newest first.
      .toSorted((a, b) =>
        Number(closed(a)) - Number(closed(b)) || (closed(a)
          ? b.createdAt - a.createdAt
          : Number(pastDeadline(b)) - Number(pastDeadline(a)) || a.createdAt - b.createdAt)
      )
  }, [all, filter, q])

  if (!access.view) {
    return (
      <Page>
        <Denied area="returns" what="de retouren" />
      </Page>
    )
  }

  const review = all.filter((r) => r.status === "te-beoordelen")
  const late = review.filter(pastDeadline).length
  const waiting = all.filter((r) => r.status === "wacht-op-pakket" || r.status === "onderweg").length
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

  /** Several returns in one step, with one line each in their history and one undo for all. */
  const bulk = (
    list: ReadonlyArray<ReturnRecord>,
    fields: (r: ReturnRecord) => Partial<ReturnRecord>,
    text: string,
    title: string,
    body?: string
  ) => {
    const before = changeReturns((st) => list.reduce((acc, r) => moveReturn(acc, r, fields(r), text, ME.name), st))
    setSelected(new Set())
    undoable(title, () => restoreReturns(before), body)
  }

  const EDIT = { area: "returns", level: 2 } as const
  /** One list for the bar, the Acties menu and the keys; each says which ticked returns it fits. */
  const actions: ReadonlyArray<RowAction<ReturnRecord>> = [
    {
      id: "goedkeuren",
      label: "Goedkeuren",
      icon: <Check />,
      bar: true,
      shortcut: "g",
      needs: EDIT,
      applies: approvable,
      run: approve
    },
    {
      id: "afwijzen",
      label: "Afwijzen",
      icon: <XCircle />,
      tone: "danger",
      bar: true,
      shortcut: "x",
      needs: EDIT,
      applies: approvable,
      run: setRejecting
    },
    {
      id: "label",
      label: "Label versturen",
      icon: <Send />,
      group: "Afhandelen",
      shortcut: "l",
      needs: EDIT,
      applies: (r) =>
        r.status === "wacht-op-pakket" && r.label !== undefined && r.label.sentAt === undefined &&
        r.label.failed === undefined,
      run: (list) =>
        bulk(
          list,
          (r) => ({
            label: { ...(r.label ?? { carrier: "PostNL", tracking: "", madeAt: returnsNow() }), sentAt: returnsNow() }
          }),
          "Retourlabel naar de klant gestuurd",
          `Label verstuurd voor ${many(list)}`
        )
    },
    {
      id: "toewijzen",
      label: "Aan mij toewijzen",
      icon: <User />,
      group: "Afhandelen",
      bar: true,
      shortcut: "i",
      needs: EDIT,
      applies: (r) => r.assignee !== ME.name && !closed(r),
      run: (list) =>
        bulk(list, () => ({ assignee: ME.name }), `Toegewezen aan ${ME.name}`, `${many(list)} aan jou toegewezen`)
    },
    {
      id: "exporteren",
      label: "Exporteren",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      run: (list) =>
        exportCsv(
          "retouren",
          ["Retour", "Bestelling", "Klant", "Artikel", "Reden", "Wens", "Status", "Bedrag"],
          list.map((r) => [
            r.number,
            `#${r.orderNumber}`,
            customer(r.customerId)?.name ?? "",
            `${product(r.productId)?.name ?? r.productId} ${r.size}`,
            REASON_LABEL[r.reason],
            wishOf(r),
            STATUS[r.status].label,
            amountOf(r).toLocaleString("nl-NL", { minimumFractionDigits: 2 })
          ])
        )
    }
  ]
  const allClosed = rows.every(closed)
  // The open ones are the list as it starts, not a filter to clear.
  const filtered = countRules(filter) > 0 && !sameFilter(filter, OPEN)

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
        <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle retouren" />
        {picked.length > 0
          ? (
            <SelectionBar
              rows={picked}
              actions={actions}
              noun={["retour", "retouren"]}
              onClear={() => setSelected(new Set())}
            />
          )
          : (
            <ListToolbar
              start={
                <>
                  <div className="w-full sm:w-72">
                    <SearchField
                      label="Retouren zoeken"
                      value={q}
                      onChange={(v) => setQuery({ q: v === "" ? null : v, pagina: null })}
                      placeholder="Zoek op retour, bestelling of klant"
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
              size="sm"
              glyph={Returns}
              title={q !== ""
                ? "Geen retouren voor deze zoekopdracht"
                : filtered
                ? "Geen retouren voor deze filters"
                : countRules(filter) > 0
                ? "Geen open retouren"
                : "Geen retouren"}
              className="py-14"
              action={filtered
                ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilter(emptyGroup())
                      setQuery({ q: null })
                    }}
                  >
                    Filters wissen
                  </Button>
                )
                : undefined}
            >
              {q === ""
                ? "Als er iets bij komt, staat het hier."
                : "Zoek op een retournummer, een bestelnummer of de naam van de klant."}
            </EmptyState>
          )
          : (
            <>
              <Table label="Retouren" minWidth={860}>
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
                  <Th align="right">{allClosed ? "Bedrag" : "Aangevraagd"}</Th>
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
                          {itemsOf(r).length > 1 && (
                            <span className="block text-2xs text-ink-3">
                              en {itemsOf(r).length - 1}{" "}
                              {itemsOf(r).length === 2 ? "ander artikel" : "andere artikelen"}
                            </span>
                          )}
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
                          {r.status === "te-beoordelen" && photoMissing(r) && (
                            <span className="block text-2xs text-warn-ink">Geen foto</span>
                          )}
                          {r.label?.failed !== undefined && r.status === "wacht-op-pakket" && (
                            <span className="block text-2xs text-bad-ink">Label mislukt</span>
                          )}
                        </Td>
                        <Td figure muted>
                          {allClosed
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
      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={(rejecting?.length ?? 0) === 1
          ? `${rejecting?.[0]?.number ?? ""} afwijzen`
          : `${rejecting?.length ?? 0} retouren afwijzen`}
        description="Elke klant krijgt de reden in een mail. Afwijzen kun je ongedaan maken tot de mails vertrekken."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Annuleren</Button>
            <Button
              variant="danger"
              onClick={() => {
                const why = rejectOwn.trim() === "" ? rejectWhy : rejectOwn.trim()
                const list = rejecting ?? []
                setRejecting(null)
                setRejectOwn("")
                bulk(
                  list,
                  () => ({ status: "afgewezen", rejectReason: why }),
                  `Afgewezen: ${why}`,
                  `${many(list)} afgewezen`,
                  "De mails vertrekken na de verzendtijd van 30 seconden."
                )
              }}
            >
              Afwijzen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <RadioGroup
            label="Reden"
            value={rejectWhy}
            onChange={setRejectWhy}
            options={REJECT_REASONS.map((x) => ({ value: x, label: x }))}
          />
          <Field label="Of in je eigen woorden" optional>
            {(c) => <Textarea {...c} rows={2} value={rejectOwn} onChange={(e) => setRejectOwn(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </Page>
  )
}

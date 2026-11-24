import { useState } from "react"
import {
  CASE_STATUS,
  casesNow,
  casesOf,
  changeCase,
  CHANNEL_LABEL,
  dueSoon,
  isOpenCase,
  recovered,
  restoreCases,
  timeLeft,
  useCases,
  waitingOnEvidence,
  winRecord
} from "../../fixtures/chargebacks.ts"
import type { Chargeback } from "../../fixtures/chargebacks.ts"
import { money, stamp } from "../../fixtures/order-desk.ts"
import { customer } from "../../fixtures/records.ts"
import { DEMO_NOW, ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { copyAndSay, exportCsv, undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { LoadError, TableSkeleton } from "../../ui/data.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { countRules, emptyGroup, sameFilter } from "../../ui/filter-model.ts"
import { FilterBuilder, FilterRules, ListToolbar, SavedViews, SelectionBar } from "../../ui/filters.tsx"
import { Copy, CreditCard, Download, FileText, Plus, Send, XCircle } from "../../ui/icons.tsx"
import { SearchField } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { seedViews } from "../../ui/views.ts"
import { dataState, useView } from "../../view.ts"
import { filterRows, isoDay, rule, useListFilter, where } from "../orders/list-filter.ts"
import type { Address, ListField } from "../orders/list-filter.ts"
import { buildPack } from "./evidence.ts"
import { NewCaseDialog } from "./new-case.tsx"

/*
 * Chargebacks (`/app`'s `_admin/chargebacks/index.tsx`): the disputes PayPal, Klarna and Stripe opened,
 * soonest deadline first. What an agent already prepared is said above the list, because the one
 * thing a person has to do is look at it and send it.
 */

const STATUS_FIELD: ListField<Chargeback> = {
  key: "status",
  label: "Status",
  type: "option",
  options: Object.values(CASE_STATUS).map((x) => x.label),
  get: (c) => CASE_STATUS[c.status].label
}
const AMOUNT_FIELD: ListField<Chargeback> = { key: "bedrag", label: "Bedrag", type: "number", get: (c) => c.amount }

const FIELDS: ReadonlyArray<ListField<Chargeback>> = [
  STATUS_FIELD,
  {
    key: "aanbieder",
    label: "Aanbieder",
    type: "option",
    options: Object.values(CHANNEL_LABEL),
    get: (c) => CHANNEL_LABEL[c.channel]
  },
  { key: "reden", label: "Reden", type: "option", get: (c) => c.reason },
  {
    key: "bewijs",
    label: "Bewijs",
    type: "option",
    options: ["Verzameld", "Ontbreekt"],
    get: (c) => (c.files.length > 0 ? "Verzameld" : "Ontbreekt")
  },
  AMOUNT_FIELD,
  { key: "deadline", label: "Deadline", type: "date", get: (c) => isoDay(c.dueAt) },
  { key: "geopend", label: "Geopend", type: "date", get: (c) => isoDay(c.openedAt) },
  { key: "klant", label: "Klant", type: "text", get: (c) => customer(c.customerId)?.name ?? "" }
]

const OPEN = where(
  "and",
  rule(STATUS_FIELD, "any", [CASE_STATUS["wacht-op-bewijs"].label, CASE_STATUS.ingediend.label])
)
const CLOSED = where("and", rule(STATUS_FIELD, "any", [CASE_STATUS.gewonnen.label, CASE_STATUS.verloren.label]))

/** The menu's "Open zaken" (no address) and "Afgesloten" (`?weergave=gesloten`); everything is `?weergave=alle`. */
const ADDRESS: Address = { cuts: { param: "weergave", filters: { open: OPEN, gesloten: CLOSED }, fallback: "open" } }

const VIEWS = "chargebacks"
seedViews(VIEWS, [
  { name: "Open", pinned: true, filter: OPEN },
  { name: "Afgesloten", pinned: false, filter: CLOSED },
  { name: "Boven € 100", pinned: false, filter: where("and", rule(AMOUNT_FIELD, "gt", "100")) }
])

/** "morgen 12:00" or "za 29 nov 23:59". */
export const dueText = (due: number) => stamp(new Date(due))

/** The cases as a few lines for the team: number, provider, order, customer, amount and where it stands. */
const summary = (list: ReadonlyArray<Chargeback>) =>
  [
    `Chargebacks, ${list.length === 1 ? "1 zaak" : `${list.length} zaken`}, ${
      money(list.reduce((n, c) => n + c.amount, 0))
    } betwist:`,
    ...list.map((c) =>
      `- ${c.id} · ${CHANNEL_LABEL[c.channel]} · #${c.orderNumber} · ${customer(c.customerId)?.name ?? ""} · ${
        money(c.amount)
      } · ${CASE_STATUS[c.status].label.toLowerCase()}${
        isOpenCase(c) && c.status === "wacht-op-bewijs" ? `, ${timeLeft(c.dueAt)}` : ""
      }`
    )
  ].join("\n")

const waiting = (c: Chargeback) => c.status === "wacht-op-bewijs"

export function ChargebacksList() {
  const view = useView()
  const access = useAccess("chargebacks")
  const state = dataState(view)
  const s = useCases()
  const q = useQuery("q") ?? ""
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [accepting, setAccepting] = useState<ReadonlyArray<Chargeback> | null>(null)
  const [submitting, setSubmitting] = useState<ReadonlyArray<Chargeback> | null>(null)
  const nieuw = useQuery("nieuw") === "1"
  const [filter, setFilter] = useListFilter(VIEWS, FIELDS, ADDRESS, () => setSelected(new Set()))

  if (!access.view) {
    return (
      <Page>
        <Denied area="chargebacks" what="de chargebacks" />
      </Page>
    )
  }

  const all = casesOf(s)
  const open = all.filter(isOpenCase)
  const evidence = waitingOnEvidence(s)
  const soon = dueSoon(s)
  const disputed = open.reduce((sum, c) => sum + c.amount, 0)
  const ready = evidence.filter((c) => c.draftedBy !== undefined)
  const needle = q.trim().toLowerCase().replace(/^#/, "")
  // Open first, soonest deadline first; the closed ones latest first.
  const rows = filterRows(all, filter, FIELDS, DEMO_NOW.date.getTime())
    .filter((c) =>
      needle === "" ||
      `${c.id} ${c.orderNumber} ${customer(c.customerId)?.name ?? ""}`.toLowerCase().includes(needle)
    )
    .toSorted((a, b) =>
      isOpenCase(a) === isOpenCase(b)
        ? (isOpenCase(a) ? a.dueAt - b.dueAt : b.dueAt - a.dueAt)
        : isOpenCase(a)
        ? -1
        : 1
    )
  const picked = rows.filter((c) => selected.has(c.id))
  // The open ones are the list as it starts, not a filter to clear.
  const filtered = countRules(filter) > 0 && !sameFilter(filter, OPEN)
  const record = winRecord(s)

  const buildAll = (list: ReadonlyArray<Chargeback>) => {
    let left = list.length
    for (const c of list) {
      buildPack(c.id, (done, total) => {
        if (done <= total) return
        left -= 1
        if (left === 0) {
          toast({
            title: list.length === 1
              ? `Bewijspakket voor ${c.id} staat klaar`
              : `${list.length} bewijspakketten staan klaar`,
            body: "Kijk ze na en dien ze in; er is nog niets verstuurd.",
            tone: "good"
          })
        }
      })
    }
    toast({
      title: list.length === 1
        ? `Pakket voor ${list[0]?.id ?? ""} wordt samengesteld`
        : `${list.length} pakketten worden samengesteld`,
      body: "De Chargeback-assistent haalt de documenten op."
    })
    setSelected(new Set())
  }
  const submitAll = (list: ReadonlyArray<Chargeback>) => {
    for (const c of list) {
      changeCase(c.id, (cur) => ({
        status: "ingediend",
        events: [...cur.events, {
          at: casesNow(),
          who: ME.name,
          text: `Bewijs ingediend bij ${CHANNEL_LABEL[cur.channel]}: ${cur.files.length} documenten en het verweer`
        }]
      }))
    }
    setSubmitting(null)
    setSelected(new Set())
    toast({
      title: list.length === 1 ? `${list[0]?.id ?? ""} ingediend` : `${list.length} zaken ingediend`,
      body: "De uitspraak komt meestal binnen 30 dagen.",
      tone: "good"
    })
  }
  /** One list for the bar, the Acties menu and the keys; each says which ticked cases it fits. */
  const actions: ReadonlyArray<RowAction<Chargeback>> = [
    {
      id: "pakket",
      label: "Bewijspakket samenstellen",
      icon: <FileText />,
      bar: true,
      shortcut: "b",
      needs: { area: "chargebacks", level: 2 },
      applies: (c) => waiting(c) && c.files.length === 0,
      run: buildAll
    },
    {
      id: "indienen",
      label: "Indienen bij aanbieder",
      icon: <Send />,
      bar: true,
      shortcut: "i",
      needs: { area: "chargebacks", level: 3 },
      applies: (c) => waiting(c) && c.files.length > 0 && c.statement.trim() !== "",
      run: setSubmitting
    },
    {
      id: "nummers",
      label: "Zaaknummers kopiëren",
      icon: <Copy />,
      group: "Delen",
      shortcut: "c",
      run: (list) => copyAndSay(list.map((c) => c.id).join(", "), list.length === 1 ? "Zaaknummer" : "Zaaknummers")
    },
    {
      id: "samenvatting",
      label: "Samenvatting kopiëren",
      icon: <Copy />,
      group: "Delen",
      shortcut: "s",
      run: (list) => copyAndSay(summary(list), "Samenvatting")
    },
    {
      id: "exporteren",
      label: "Exporteren",
      icon: <Download />,
      group: "Delen",
      shortcut: "e",
      run: (list) =>
        exportCsv(
          "chargebacks",
          ["Zaak", "Aanbieder", "Bestelling", "Klant", "Reden", "Bedrag", "Status", "Deadline"],
          list.map((c) => [
            c.id,
            CHANNEL_LABEL[c.channel],
            `#${c.orderNumber}`,
            customer(c.customerId)?.name ?? "",
            c.reason,
            c.amount.toLocaleString("nl-NL", { minimumFractionDigits: 2 }),
            CASE_STATUS[c.status].label,
            dueText(c.dueAt)
          ])
        )
    },
    {
      id: "accepteren",
      label: "Accepteren als verloren",
      icon: <XCircle />,
      group: "Delen",
      tone: "danger",
      needs: { area: "chargebacks", level: 3 },
      applies: waiting,
      run: setAccepting
    }
  ]
  const head = (
    <PageHead
      title="Chargebacks"
      meta={state === "ready"
        ? (
          <>
            {open.length} open · {evidence.length} wachten op bewijs, {soon.length} binnen 48 uur ·{" "}
            <span className="figure">{money(disputed)}</span> betwist
          </>
        )
        : state === "empty"
        ? "0 chargebacks"
        : undefined}
      actions={access.edit && (
        <Button icon={<Plus />} onClick={() => setQuery({ nieuw: "1" })}>Nieuwe chargeback</Button>
      )}
    />
  )

  if (state === "loading") {
    return (
      <Page>
        {head}
        <TableSkeleton rows={5} columns={[64, 60, 56, 140, 160, 70, 90]} />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page>
        {head}
        <LoadError what="De chargebacks" detail="GET /disputes · 502 · req_2b9d40" />
      </Page>
    )
  }
  if (state === "empty") {
    return (
      <Page>
        {head}
        <EmptyState
          glyph={CreditCard}
          title="Geen chargebacks"
          action={<ButtonLink to={paths.agent("chargebacks")}>Chargeback-assistent bekijken</ButtonLink>}
        >
          Een chargeback komt hier binnen zodra een aanbieder er een opent. De Chargeback-assistent verzamelt dan het
          bewijs voor je.
        </EmptyState>
      </Page>
    )
  }

  return (
    <Page>
      {head}
      {!access.edit && <ReadOnlyNotice area="chargebacks" />}
      <NewCaseDialog open={nieuw} onClose={() => setQuery({ nieuw: null })} />
      {record.decided > 0 && (
        <p className="text-sm text-ink-2">
          <span className="figure">{record.won}</span> van <span className="figure">{record.decided}</span>{" "}
          beslechte zaken gewonnen · <span className="figure">{money(recovered(s))}</span> behouden
        </p>
      )}
      {ready.map((c) => (
        <Notice
          key={c.id}
          tone="warn"
          title={`Bewijspakket klaar voor ${c.id}`}
          action={<ButtonLink size="sm" variant="primary" to={paths.chargeback(c.id)}>Bekijken</ButtonLink>}
        >
          {CHANNEL_LABEL[c.channel]} wil een antwoord vóór {dueText(c.dueAt)} ({timeLeft(c.dueAt)}). De{" "}
          {c.draftedBy?.agent} verzamelde {c.files.length} documenten en schreef het verweer; er gaat niets naar{" "}
          {CHANNEL_LABEL[c.channel]} tot jij het indient.
        </Notice>
      ))}
      <div className="flex flex-col gap-3">
        <SavedViews list={VIEWS} value={filter} onPick={setFilter} allLabel="Alle chargebacks" />
        {picked.length > 0
          ? (
            <SelectionBar
              rows={picked}
              actions={actions}
              noun={["zaak", "zaken"]}
              onClear={() => setSelected(new Set())}
            />
          )
          : (
            <ListToolbar
              start={
                <>
                  <div className="w-full sm:w-64">
                    <SearchField
                      label="Chargebacks zoeken"
                      value={q}
                      onChange={(v) => setQuery({ q: v === "" ? null : v })}
                      placeholder="Zoek op zaak, bestelling of klant"
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
              glyph={CreditCard}
              title={q !== "" || filtered
                ? "Geen chargebacks voor deze filters"
                : countRules(filter) > 0
                ? "Geen open chargebacks"
                : "Geen chargebacks"}
              className="py-14"
              action={q !== "" || filtered
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
              Een chargeback komt hier binnen zodra een aanbieder er een opent.
            </EmptyState>
          )
          : (
            <Table label="Chargebacks" minWidth={820}>
              <THead>
                <Th width={40}>
                  <RowCheckbox
                    label="Alles kiezen"
                    checked={rows.every((c) => selected.has(c.id))}
                    indeterminate={picked.length > 0 && picked.length < rows.length}
                    onChange={(on) => setSelected(on ? new Set(rows.map((c) => c.id)) : new Set())}
                  />
                </Th>
                <Th>Zaak</Th>
                <Th>Aanbieder</Th>
                <Th>Bestelling</Th>
                <Th>Klant</Th>
                <Th>Reden</Th>
                <Th align="right">Bedrag</Th>
                <Th>Status</Th>
                <Th align="right">Deadline</Th>
              </THead>
              <TBody>
                {rows.map((c) => {
                  const urgent = c.status === "wacht-op-bewijs" && soon.includes(c)
                  return (
                    <Tr key={c.id} selected={selected.has(c.id)} onOpen={() => navigate(paths.chargeback(c.id))}>
                      <Td>
                        <RowCheckbox
                          label={`${c.id} kiezen`}
                          checked={selected.has(c.id)}
                          onChange={(on) =>
                            setSelected((cur) => {
                              const next = new Set(cur)
                              if (on) next.add(c.id)
                              else next.delete(c.id)
                              return next
                            })}
                        />
                      </Td>
                      <Td header>
                        <Link to={paths.chargeback(c.id)} className="figure font-medium text-ink hover:underline">
                          {c.id}
                        </Link>
                      </Td>
                      <Td muted>
                        <span className="flex items-center gap-2">
                          <ServiceLogo service={c.channel} name={CHANNEL_LABEL[c.channel]} size={20} />
                          {CHANNEL_LABEL[c.channel]}
                        </span>
                      </Td>
                      <Td>
                        {c.linked
                          ? (
                            <Link to={paths.order(c.orderNumber)} className="figure text-ink-2 hover:underline">
                              #{c.orderNumber}
                            </Link>
                          )
                          : <span className="figure text-ink-3">#{c.orderNumber}</span>}
                      </Td>
                      <Td>
                        <span className="block max-w-40 truncate text-ink">
                          {customer(c.customerId)?.name ?? c.customerId}
                        </span>
                      </Td>
                      <Td muted>
                        <span className="block max-w-48 truncate">{c.reason}</span>
                      </Td>
                      <Td figure>{money(c.amount)}</Td>
                      <Td>
                        <Status tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Status>
                        {c.status === "wacht-op-bewijs" && c.draftedBy !== undefined && (
                          <span className="block text-2xs text-ink-3">Pakket klaar</span>
                        )}
                      </Td>
                      <Td figure muted>
                        {isOpenCase(c)
                          ? (
                            <span className={urgent ? "font-medium text-bad-ink" : undefined}>
                              {c.status === "ingediend" ? "Uitspraak" : timeLeft(c.dueAt)}
                              <span className="block text-2xs font-normal text-ink-3">{dueText(c.dueAt)}</span>
                            </span>
                          )
                          : dueText(c.dueAt)}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          )}
      </div>
      <AlertDialog
        open={accepting !== null}
        onCancel={() => setAccepting(null)}
        onConfirm={() => {
          const list = accepting ?? []
          let before = null as ReturnType<typeof changeCase> | null
          for (const c of list) {
            const was = changeCase(c.id, (cur) => ({
              status: "verloren",
              events: [...cur.events, {
                at: casesNow(),
                who: ME.name,
                text: "Geaccepteerd en terugbetaald",
                tone: "bad"
              }]
            }))
            before ??= was
          }
          setAccepting(null)
          setSelected(new Set())
          if (before !== null) {
            const to = before
            undoable(
              `${list.length === 1 ? list[0]?.id ?? "" : `${list.length} zaken`} geaccepteerd als verloren`,
              () => restoreCases(to),
              "Ongedaan maken kan de komende 30 seconden."
            )
          }
        }}
        title={(accepting?.length ?? 0) === 1
          ? "Geschil accepteren?"
          : `${accepting?.length ?? 0} geschillen accepteren?`}
        body={`${
          money((accepting ?? []).reduce((sum, c) => sum + c.amount, 0))
        } gaat terug naar de klant en de zaak sluit als verloren. Na de verzendtijd van 30 seconden kan dit niet ongedaan worden gemaakt.`}
        confirmLabel="Accepteren als verloren"
        cancelLabel="Niet accepteren"
      />
      <AlertDialog
        open={submitting !== null}
        onCancel={() => setSubmitting(null)}
        onConfirm={() => submitAll(submitting ?? [])}
        title={(submitting?.length ?? 0) === 1
          ? `${submitting?.[0]?.id ?? ""} indienen bij ${CHANNEL_LABEL[submitting?.[0]?.channel ?? "klarna"]}?`
          : `${submitting?.length ?? 0} zaken indienen?`}
        body={`Elke aanbieder beoordeelt wat je stuurt zoals het is; je kunt daarna niets meer toevoegen. ${
          (submitting ?? []).map((c) => `${c.id} naar ${CHANNEL_LABEL[c.channel]}`).join(", ")
        }.`}
        confirmLabel={(submitting?.length ?? 0) === 1 ? "Indienen" : `${submitting?.length ?? 0} zaken indienen`}
        cancelLabel="Nog niet"
      />
    </Page>
  )
}

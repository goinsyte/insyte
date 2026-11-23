import { useState } from "react"
import {
  CASE_STATUS,
  casesNow,
  casesOf,
  changeCase,
  CHANNEL_LABEL,
  dueSoon,
  isOpenCase,
  restoreCases,
  timeLeft,
  useCases,
  waitingOnEvidence
} from "../../fixtures/chargebacks.ts"
import type { Chargeback } from "../../fixtures/chargebacks.ts"
import { money, stamp } from "../../fixtures/order-desk.ts"
import { customer } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { exportCsv, undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import { ButtonLink } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { LoadError, TableSkeleton } from "../../ui/data.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import { CreditCard, Download, XCircle } from "../../ui/icons.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { dataState, useView } from "../../view.ts"

/*
 * Chargebacks (`/app`'s `_admin/chargebacks/index.tsx`): the disputes PayPal, Klarna and Stripe opened,
 * soonest deadline first. What an agent already prepared is said above the list, because the one
 * thing a person has to do is look at it and send it.
 */

type View = "open" | "gesloten" | "alle"
const VIEW_LABEL: Readonly<Record<View, string>> = { open: "Open", gesloten: "Afgesloten", alle: "Alle" }
const inView = (c: Chargeback, v: View) => (v === "alle" ? true : v === "open" ? isOpenCase(c) : !isOpenCase(c))

/** "morgen 12:00" or "za 29 nov 23:59". */
export const dueText = (due: number) => stamp(new Date(due))

export function ChargebacksList() {
  const view = useView()
  const access = useAccess("chargebacks")
  const state = dataState(view)
  const s = useCases()
  const tab = (useQuery("weergave") ?? "open") as View
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [accepting, setAccepting] = useState<ReadonlyArray<Chargeback> | null>(null)

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
  const rows = all.filter((c) => inView(c, tab ?? "open")).toSorted((
    a,
    b
  ) => (isOpenCase(a) === isOpenCase(b)
    ? (tab === "gesloten" ? b.dueAt - a.dueAt : a.dueAt - b.dueAt)
    : isOpenCase(a)
    ? -1
    : 1)
  )
  const picked = rows.filter((c) => selected.has(c.id))
  const acceptable = picked.filter((c) => c.status === "wacht-op-bewijs")

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
        <Tabs
          label="Weergaven"
          value={tab}
          onChange={(v) => {
            setSelected(new Set())
            setQuery({ weergave: v === "open" ? null : v })
          }}
          tabs={(Object.keys(VIEW_LABEL) as ReadonlyArray<View>).map((v) => ({
            value: v,
            label: VIEW_LABEL[v],
            count: all.filter((c) => inView(c, v)).length
          }))}
        />
        {picked.length > 0 && (
          <SelectionBar
            count={picked.length}
            noun={["zaak", "zaken"]}
            onClear={() => setSelected(new Set())}
          >
            {access.manage && acceptable.length > 0 && (
              <SelectionAction
                icon={<XCircle />}
                tone="danger"
                onClick={() => setAccepting(acceptable)}
              >
                Accepteren als verloren
              </SelectionAction>
            )}
            <SelectionAction
              icon={<Download />}
              onClick={() =>
                exportCsv(
                  "chargebacks",
                  ["Zaak", "Aanbieder", "Bestelling", "Klant", "Reden", "Bedrag", "Status", "Deadline"],
                  picked.map((c) => [
                    c.id,
                    CHANNEL_LABEL[c.channel],
                    `#${c.orderNumber}`,
                    customer(c.customerId)?.name ?? "",
                    c.reason,
                    c.amount.toLocaleString("nl-NL", { minimumFractionDigits: 2 }),
                    CASE_STATUS[c.status].label,
                    dueText(c.dueAt)
                  ])
                )}
            >
              Exporteren
            </SelectionAction>
          </SelectionBar>
        )}
        {rows.length === 0
          ? (
            <EmptyState
              size="sm"
              glyph={CreditCard}
              title={tab === "open" ? "Geen open chargebacks" : "Nog niets afgesloten"}
              className="py-14"
            >
              Een chargeback komt hier binnen zodra een aanbieder er een opent.
            </EmptyState>
          )
          : (
            <Table label={VIEW_LABEL[tab]} minWidth={820}>
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
                      <Td muted>{CHANNEL_LABEL[c.channel]}</Td>
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
    </Page>
  )
}

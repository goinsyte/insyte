import { useEffect, useMemo, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  addEvent,
  busyName,
  changeDesk,
  customerMail,
  deskLegs,
  deskOrder,
  legLate,
  money,
  REASON_LABEL,
  restoreDesk,
  setStatus,
  SUPPLIER_VIA,
  useDesk,
  VIA_LABEL,
  waited
} from "../../fixtures/order-desk.ts"
import type { Leg, Via } from "../../fixtures/order-desk.ts"
import { product, supplier, SUPPLIERS } from "../../fixtures/records.ts"
import type { Order } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { RadioGroup, RowCheckbox } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import { SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import { Check, Download, Factory, Mail, MoreHorizontal, Send, XCircle } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { dataState, useView } from "../../view.ts"
import { exportCsv, LoadError, TableSkeleton, undoable } from "./parts.tsx"

/*
 * Bij leverancier (`/app`'s forwarding queue, `orders/forwarding.tsx`, PLAN 24): what has not gone out
 * yet, one row per order × supplier, in three views: Te versturen, Wacht op bevestiging, Uitverkocht
 * of fout. Doorsturen opens one dialog for any number of them, grouped by supplier; a send waits out
 * the 30-second window as "Wordt doorgestuurd" and can be taken back until then.
 */

export type QueueTab = "te-versturen" | "wacht" | "fout"
const TAB_LABEL: Readonly<Record<QueueTab, string>> = {
  "te-versturen": "Te versturen",
  wacht: "Wacht op bevestiging",
  fout: "Uitverkocht of fout"
}
const SEND_WINDOW = 30_000

const inTab = (leg: Leg, tab: QueueTab) =>
  tab === "te-versturen"
    ? leg.state === "te-versturen"
    : tab === "wacht"
    ? leg.state === "wacht" || leg.state === "wordt-verstuurd"
    : leg.state === "fout"

const name = (id: string) => supplier(id)?.name ?? id
const sendable = (list: ReadonlyArray<Leg>) => list.filter((l) => l.state === "te-versturen" || l.state === "fout")

/** A clock that ticks every second while a send is in its window, so the row moves on by itself. */
function useSendingTick(legs: ReadonlyArray<Leg>) {
  const [, setNow] = useState(0)
  const sending = legs.some((l) => l.state === "wordt-verstuurd")
  useEffect(() => {
    if (!sending) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sending])
}

/** The leg's state in words beside its dot; a late one says how long. */
export function LegStatus({ leg }: { readonly leg: Leg }) {
  if (leg.state === "wordt-verstuurd") return <Status tone="accent">Wordt doorgestuurd</Status>
  if (leg.state === "wacht") {
    return legLate(leg)
      ? <Status tone="bad">Te laat · {waited(leg.since)}</Status>
      : <Status>Wacht op bevestiging</Status>
  }
  if (leg.state === "fout") return <Status tone="bad">{REASON_LABEL[leg.reason ?? "geweigerd"]}</Status>
  if (leg.state === "bevestigd") return <Status tone="good">Bevestigd</Status>
  return <Status tone="warn">Te versturen</Status>
}

const linesFor = (o: Order, leg: Leg) =>
  o.lines.filter((l) => product(l.productId)?.supplierId === (leg.from ?? leg.supplierId))

/** "2× Aurora Hooded Fleece · M". */
const lineText = (o: Order, leg: Leg) =>
  linesFor(o, leg).map((l) => `${l.quantity}× ${product(l.productId)?.name ?? l.productId} · ${l.size}`).join(", ")

/** Send legs to their suppliers: each waits out the window, then waits for the supplier. */
function forwardLegs(legs: ReadonlyArray<Leg>, via: Readonly<Record<string, Via>>, note: string) {
  const until = Date.now() + SEND_WINDOW
  const before = changeDesk((d) => {
    let next = { ...d, legs: { ...d.legs } }
    for (const leg of legs) {
      const how = via[leg.supplierId] ?? SUPPLIER_VIA[leg.supplierId]?.via ?? "portaal"
      next.legs[leg.key] = {
        state: "wordt-verstuurd",
        via: how,
        by: ME.name,
        sendingUntil: until,
        since: new Date(2026, 10, 23, 14, 30).getTime()
      }
      next = addEvent(
        next,
        leg.orderNumber,
        `Doorgestuurd naar ${name(leg.supplierId)} door ${ME.name}${note === "" ? "" : `: ‘${note}’`}`
      )
    }
    return next
  })
  const orders = new Set(legs.map((l) => l.orderNumber)).size
  const suppliers = new Set(legs.map((l) => l.supplierId)).size
  undoable(
    `${orders === 1 ? "1 bestelling" : `${orders} bestellingen`} naar ${
      suppliers === 1 ? name(legs[0]?.supplierId ?? "") : `${suppliers} leveranciers`
    }`,
    () => restoreDesk(before),
    "Wordt doorgestuurd. Ongedaan maken kan de komende 30 seconden."
  )
}

export function ForwardingQueue() {
  const view = useView()
  const access = useAccess("orders")
  const state = dataState(view)
  const busy = view.staat === "druk"
  const desk = useDesk()
  const tab = (useQuery("tab") ?? "te-versturen") as QueueTab
  const legs = state === "empty" ? [] : deskLegs(desk)
  useSendingTick(legs)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [forwarding, setForwarding] = useState<ReadonlyArray<Leg> | null>(null)
  const [rerouting, setRerouting] = useState<Leg | null>(null)
  const [mailing, setMailing] = useState<Leg | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)

  const counts = useMemo(() => ({
    "te-versturen": legs.filter((l) => inTab(l, "te-versturen")).length,
    wacht: legs.filter((l) => inTab(l, "wacht")).length,
    fout: legs.filter((l) => inTab(l, "fout")).length,
    late: legs.filter(legLate).length
  }), [legs])
  const rows = legs.filter((l) => inTab(l, tab)).toSorted((a, b) => a.since - b.since)
  const picked = rows.filter((l) => selected.has(l.key))

  const head = (
    <PageHead
      title="Bij leverancier"
      meta={state === "ready"
        ? `${counts["te-versturen"]} te versturen · ${counts.wacht} wachten op bevestiging${
          counts.late > 0 ? `, ${counts.late} te laat` : ""
        } · ${counts.fout} uitverkocht of fout`
        : undefined}
      actions={access.edit && state === "ready" && tab !== "wacht" && sendable(rows).length > 0
        ? (
          <Button variant="primary" icon={<Send />} onClick={() => setForwarding(sendable(rows))}>
            Alles doorsturen
          </Button>
        )
        : undefined}
    />
  )

  if (state === "loading") {
    return (
      <Page>
        {head}
        <TableSkeleton columns={[64, 120, 200, 120, 110]} />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page>
        {head}
        <LoadError what="De zendingen" detail="GET /forwarding/legs · 503 · req_51ab0e" />
      </Page>
    )
  }

  const confirm = (list: ReadonlyArray<Leg>) => {
    const before = changeDesk((d) => {
      let next = { ...d, legs: { ...d.legs } }
      for (const leg of list) {
        next.legs[leg.key] = { state: "bevestigd", by: ME.name, since: new Date(2026, 10, 23, 14, 30).getTime() }
        next = addEvent(next, leg.orderNumber, `Als bevestigd gemarkeerd voor ${name(leg.supplierId)} door ${ME.name}`)
      }
      return setStatus(next, list.map((l) => l.orderNumber), "bij-leverancier")
    })
    setSelected(new Set())
    undoable(
      `${list.length === 1 ? "1 zending" : `${list.length} zendingen`} als bevestigd gemarkeerd`,
      () => restoreDesk(before)
    )
  }

  return (
    <Page>
      {head}
      {!access.edit && <ReadOnlyNotice area="orders" />}
      <p className="-mt-4 max-w-[68ch] text-sm text-pretty text-ink-3">
        Elke leverancier krijgt alleen zijn eigen regels en het verzendadres, nooit de prijzen of de andere
        leveranciers.
      </p>
      <div className="flex flex-col gap-3">
        <Tabs
          label="Zendingen"
          value={tab}
          onChange={(t) => {
            setSelected(new Set())
            setQuery({ tab: t === "te-versturen" ? null : t })
          }}
          tabs={(Object.keys(TAB_LABEL) as ReadonlyArray<QueueTab>).map((t) => ({
            value: t,
            label: TAB_LABEL[t],
            count: counts[t]
          }))}
        />
        {picked.length > 0 && (
          <SelectionBar
            count={picked.length}
            noun={["zending", "zendingen"]}
            onClear={() => setSelected(new Set())}
          >
            {access.edit && sendable(picked).length > 0 && (
              <SelectionAction
                icon={<Send />}
                onClick={() => setForwarding(sendable(picked))}
              >
                Doorsturen
              </SelectionAction>
            )}
            {access.edit && tab === "wacht" && (
              <SelectionAction icon={<Check />} onClick={() => confirm(picked)}>Als bevestigd markeren</SelectionAction>
            )}
            <SelectionAction
              icon={<Download />}
              onClick={() =>
                exportCsv(
                  "zendingen",
                  ["Bestelling", "Leverancier", "Status", "Sinds"],
                  picked.map((l) => [`#${l.orderNumber}`, name(l.supplierId), l.state, waited(l.since)])
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
              glyph={Factory}
              title={tab === "te-versturen"
                ? "Alles is doorgestuurd"
                : tab === "wacht"
                ? "Niets wacht op een leverancier"
                : "Geen fouten"}
              className="py-14"
            >
              {tab === "te-versturen"
                ? "Betaalde bestellingen komen hier tot ze naar hun leverancier gaan."
                : tab === "wacht"
                ? "Wat je doorstuurt, staat hier tot de leverancier het bevestigt."
                : "Wat een leverancier niet kan leveren, staat hier met de volgende stap."}
            </EmptyState>
          )
          : (
            <Table label={TAB_LABEL[tab]} minWidth={820}>
              <THead>
                <Th width={40}>
                  <RowCheckbox
                    label="Alles kiezen"
                    checked={rows.every((l) => selected.has(l.key))}
                    indeterminate={picked.length > 0 && picked.length < rows.length}
                    onChange={(on) => setSelected(on ? new Set(rows.map((l) => l.key)) : new Set())}
                  />
                </Th>
                <Th>Bestelling</Th>
                <Th>Leverancier</Th>
                <Th>Artikelen</Th>
                <Th>Klant</Th>
                <Th>Status</Th>
                <Th>Sinds</Th>
                {access.edit && (
                  <Th align="right">
                    <span className="sr-only">Actie</span>
                  </Th>
                )}
              </THead>
              <TBody>
                {rows.map((leg) => {
                  const o = deskOrder(leg.orderNumber, desk)
                  if (o === undefined) return null
                  return (
                    <Tr
                      key={leg.key}
                      selected={selected.has(leg.key)}
                      onOpen={() => navigate(paths.order(o.number))}
                    >
                      <Td>
                        <RowCheckbox
                          label={`#${o.number} bij ${name(leg.supplierId)} kiezen`}
                          checked={selected.has(leg.key)}
                          onChange={(on) =>
                            setSelected((s) => {
                              const next = new Set(s)
                              if (on) next.add(leg.key)
                              else next.delete(leg.key)
                              return next
                            })}
                        />
                      </Td>
                      <Td header>
                        <Link to={paths.order(o.number)} className="figure font-medium text-ink hover:underline">
                          #{o.number}
                        </Link>
                      </Td>
                      <Td>
                        <span className="text-ink">{name(leg.supplierId)}</span>
                        {leg.from !== undefined && (
                          <span className="block text-2xs text-ink-3">was {name(leg.from)}</span>
                        )}
                      </Td>
                      <Td muted>
                        <span className="block max-w-64 truncate">{lineText(o, leg)}</span>
                        {leg.note !== undefined && leg.state === "fout" && (
                          <span className="block max-w-64 truncate text-2xs text-bad-ink">{leg.note}</span>
                        )}
                      </Td>
                      <Td muted>
                        <span className="block max-w-40 truncate">{busyName(o, busy)}</span>
                      </Td>
                      <Td>
                        <LegStatus leg={leg} />
                      </Td>
                      <Td figure muted>{waited(leg.since)}</Td>
                      {access.edit && (
                        <Td align="right">
                          {leg.state === "te-versturen" && (
                            <Button size="sm" onClick={() => setForwarding([leg])}>Doorsturen</Button>
                          )}
                          {leg.state === "wacht" && (
                            <Button size="sm" variant="ghost" onClick={() => confirm([leg])}>Bevestigd</Button>
                          )}
                          {leg.state === "fout" && (
                            <span className="inline-flex items-center justify-end gap-1">
                              {leg.reason === "adres"
                                ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate(`${paths.order(o.number)}?adres=1`)}
                                  >
                                    Adres aanpassen
                                  </Button>
                                )
                                : (
                                  <Button size="sm" variant="ghost" onClick={() => setRerouting(leg)}>
                                    Andere leverancier
                                  </Button>
                                )}
                              <Button size="sm" variant="ghost" icon={<Mail />} onClick={() => setMailing(leg)}>
                                Klant mailen
                              </Button>
                              <DropdownMenu
                                label={`Meer voor #${o.number}`}
                                placement="bottom-end"
                                trigger={(props) => (
                                  <IconButton {...props} label={`Meer voor #${o.number}`}>
                                    <MoreHorizontal />
                                  </IconButton>
                                )}
                              >
                                <DropdownItem glyph={XCircle} tone="danger" onSelect={() => setCancelling(o)}>
                                  Bestelling annuleren
                                </DropdownItem>
                              </DropdownMenu>
                            </span>
                          )}
                        </Td>
                      )}
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          )}
      </div>
      <ForwardDialog
        legs={forwarding}
        onClose={() => {
          setForwarding(null)
          setSelected(new Set())
        }}
      />
      <RerouteDialog leg={rerouting} onClose={() => setRerouting(null)} />
      <MailCustomerDialog leg={mailing} onClose={() => setMailing(null)} />
      <AlertDialog
        open={cancelling !== null}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const o = cancelling
          if (o === null) return
          const before = changeDesk((d) =>
            setStatus(d, [o.number], "geannuleerd", () => `Geannuleerd door ${ME.name}; Shopify mailt de klant`)
          )
          setCancelling(null)
          undoable(
            `#${o.number} geannuleerd`,
            () => restoreDesk(before),
            `${money(o.total)} gaat terug naar ${busyName(o, false)}. Ongedaan maken kan de komende 30 seconden.`
          )
        }}
        title={cancelling === null ? "" : `#${cancelling.number} annuleren?`}
        body={cancelling === null
          ? ""
          : `De bestelling van ${busyName(cancelling, false)} wordt in Shopify geannuleerd en ${
            money(cancelling.total)
          } gaat terug naar de klant. Na de verzendtijd van 30 seconden kun je dat niet meer terugdraaien.`}
        confirmLabel="Bestelling annuleren"
        cancelLabel="Bestelling houden"
      />
    </Page>
  )
}

/**
 * One dialog for any number of legs: per supplier the orders and their lines, how they go, a note,
 * and the button that says what will happen ("12 bestellingen naar 3 leveranciers doorsturen").
 */
export function ForwardDialog(
  { legs, onClose }: { readonly legs: ReadonlyArray<Leg> | null; readonly onClose: () => void }
) {
  const desk = useDesk()
  const [via, setVia] = useState<Readonly<Record<string, Via>>>({})
  const [note, setNote] = useState("")
  const list = legs ?? []
  const groups = [...new Set(list.map((l) => l.supplierId))].map((s) => ({
    s,
    legs: list.filter((l) => l.supplierId === s)
  }))
  const orders = new Set(list.map((l) => l.orderNumber)).size
  const sentence = `${orders === 1 ? "1 bestelling" : `${orders} bestellingen`} naar ${
    groups.length === 1 ? name(groups[0]?.s ?? "") : `${groups.length} leveranciers`
  } doorsturen`
  const close = () => {
    setVia({})
    setNote("")
    onClose()
  }
  return (
    <Dialog
      open={legs !== null}
      onClose={close}
      size="lg"
      title="Doorsturen naar leveranciers"
      description="Elke leverancier krijgt alleen zijn eigen regels en het verzendadres, nooit de prijzen of de andere leveranciers."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={list.length === 0}
            onClick={() => {
              forwardLegs(list, via, note.trim())
              close()
            }}
          >
            {sentence.charAt(0).toUpperCase() + sentence.slice(1)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {groups.map((g) => (
          <section key={g.s} aria-label={name(g.s)} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {name(g.s)}{" "}
                <span className="font-normal text-ink-3">
                  · {g.legs.length === 1 ? "1 bestelling" : `${g.legs.length} bestellingen`}
                </span>
              </p>
              <Segmented
                size="sm"
                label={`Hoe naar ${name(g.s)}`}
                value={via[g.s] ?? SUPPLIER_VIA[g.s]?.via ?? "portaal"}
                onChange={(v) => setVia((s) => ({ ...s, [g.s]: v }))}
                options={(Object.keys(VIA_LABEL) as ReadonlyArray<Via>).map((v) => ({ value: v, label: VIA_LABEL[v] }))}
              />
            </div>
            <ul className="flex flex-col gap-1 rounded-md bg-well px-3 py-2">
              {g.legs.map((leg) => {
                const o = deskOrder(leg.orderNumber, desk)
                return (
                  <li key={leg.key} className="flex min-w-0 items-baseline gap-2 text-sm">
                    <span className="figure shrink-0 font-medium text-ink">#{leg.orderNumber}</span>
                    <span className="min-w-0 truncate text-ink-2">{o === undefined ? "" : lineText(o, leg)}</span>
                    {leg.state === "fout" && <span className="shrink-0 text-xs text-bad-ink">opnieuw</span>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        <Field label="Notitie voor de leveranciers" optional>
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bijvoorbeeld: cadeauverpakking, geen prijzen op de pakbon"
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/** A failed leg to another supplier: it comes back under Te versturen, there. */
function RerouteDialog({ leg, onClose }: { readonly leg: Leg | null; readonly onClose: () => void }) {
  const [pick, setPick] = useState("")
  const others = SUPPLIERS.filter((s) => s.status === "actief" && s.id !== leg?.supplierId)
  const close = () => {
    setPick("")
    onClose()
  }
  return (
    <Dialog
      open={leg !== null}
      onClose={close}
      size="sm"
      title={leg === null ? "" : `#${leg.orderNumber} naar een andere leverancier`}
      description={leg === null
        ? undefined
        : `${name(leg.supplierId)}: ${
          REASON_LABEL[leg.reason ?? "geweigerd"].toLowerCase()
        }. Kies wie het wel kan leveren; de bestelling komt dan weer bij Te versturen.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={pick === ""}
            onClick={() => {
              if (leg === null) return
              const before = changeDesk((d) =>
                addEvent(
                  {
                    ...d,
                    legs: {
                      ...d.legs,
                      [leg.key]: {
                        supplierId: pick,
                        from: leg.supplierId,
                        state: "te-versturen",
                        since: new Date(2026, 10, 23, 14, 30).getTime()
                      }
                    }
                  },
                  leg.orderNumber,
                  `Van ${name(leg.supplierId)} naar ${name(pick)} gezet door ${ME.name}`
                )
              )
              undoable(
                `#${leg.orderNumber} gaat naar ${name(pick)}`,
                () => restoreDesk(before),
                "Hij staat weer bij Te versturen."
              )
              close()
            }}
          >
            {pick === "" ? "Kies een leverancier" : `Naar ${name(pick)}`}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <RadioGroup
          label="Leverancier"
          value={pick}
          onChange={setPick}
          options={others.map((s) => ({
            value: s.id,
            label: s.name,
            description: `Gemiddeld ${s.leadDays.toLocaleString("nl-NL")} dagen, belofte ${s.promiseDays}`
          }))}
        />
      </div>
    </Dialog>
  )
}

/**
 * Klant mailen, on a leg a supplier could not take: the shopper told what went wrong in Northwind's
 * words, drafted from the reason. It goes after the send window and lands in the order's history.
 */
export function MailCustomerDialog({ leg, onClose }: { readonly leg: Leg | null; readonly onClose: () => void }) {
  const order = leg === null ? undefined : deskOrder(leg.orderNumber)
  const draft = order === undefined || leg === null ? undefined : customerMail(order, leg)
  const [subject, setSubject] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const subj = subject ?? draft?.subject ?? ""
  const text = body ?? draft?.body ?? ""
  const close = () => {
    setSubject(null)
    setBody(null)
    onClose()
  }
  const send = () => {
    if (order === undefined) return
    const before = changeDesk((d) => addEvent(d, order.number, `Klant gemaild door ${ME.name}: ${subj.trim()}`))
    undoable(
      `Mail aan ${busyName(order, false)} wordt verstuurd`,
      () => restoreDesk(before),
      "Hij vertrekt na de verzendtijd van 30 seconden en staat daarna in de geschiedenis."
    )
    close()
  }
  return (
    <Dialog
      open={leg !== null}
      onClose={close}
      title={order === undefined ? "" : `${busyName(order, false)} mailen`}
      description={draft === undefined || draft.to === ""
        ? "Er is geen e-mailadres bekend voor deze klant."
        : `Aan ${draft.to}. ${ASSISTANT} schreef het concept; jij verstuurt het.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button
            variant="primary"
            icon={<Send />}
            disabled={draft === undefined || draft.to === "" || subj.trim() === "" || text.trim() === ""}
            onClick={send}
          >
            Versturen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label="Onderwerp">
          {(c) => <Input {...c} value={subj} onChange={(e) => setSubject(e.target.value)} />}
        </Field>
        <Field label="Bericht">
          {(c) => <Textarea {...c} rows={9} value={text} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

import { useState } from "react"
import { CASE_STATUS, CHANNEL_LABEL, orderCases, useCases } from "../../fixtures/chargebacks.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import {
  addEvent,
  baseAddress,
  btwOf,
  busyName,
  changeDesk,
  countryName,
  deskOrder,
  historyOf,
  isClosed,
  isConcept,
  LATE_STORY,
  linesTotal,
  longDate,
  money,
  ORDER_TICKETS,
  orderLegs,
  ownTags,
  promisedOf,
  restoreDesk,
  setStatus,
  shipped,
  stamp,
  statusOf,
  storeName,
  suppliersOf,
  trackingOf,
  useDesk,
  VIA_LABEL
} from "../../fixtures/order-desk.ts"
import type { HistoryLine, Leg } from "../../fixtures/order-desk.ts"
import { customer, customerOrders, product, supplier } from "../../fixtures/records.ts"
import type { Order } from "../../fixtures/records.ts"
import { orderReturns, STATUS as RETURN_STATUS, useReturnsState } from "../../fixtures/returns.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  AlertTriangle,
  Banknote,
  Box,
  Check,
  Copy,
  CreditCard,
  Edit,
  FileText,
  MapPin,
  MoreHorizontal,
  Returns,
  ShoppingBag,
  TagGlyph,
  Truck,
  XCircle
} from "../../ui/icons.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Stepper } from "../../ui/stepper.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import type { TimelineItem } from "../../ui/timeline.tsx"
import { dataState, useView } from "../../view.ts"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { AddressDialog, NoteDialog, RefundDialog, StartReturnDialog, TagDialog } from "./dialogs.tsx"
import { ForwardDialog, LegStatus } from "./forwarding.tsx"
import { copyText, Fact, LoadError, RecordSkeleton, refundLimit, undoable } from "./parts.tsx"

/*
 * One order (`/app`'s `orders/$orderId`, `order-screen.tsx`): where it is (the steps), what is in it,
 * which supplier has which lines, what happened, and who it belongs to. The money acts (terugbetalen,
 * annuleren) confirm first and keep the 30-second send window as an undo.
 */

const STEPS = ["Betaald", "Naar leverancier", "Bevestigd", "Verzonden", "Bezorgd"] as const

function stepOf(o: Order, legs: ReadonlyArray<Leg>): { readonly current: number; readonly stalled: boolean } {
  if (o.status === "vertraagd") return { current: 3, stalled: true }
  if (o.status === "bezorgd" || o.status === "retour" || o.status === "terugbetaald") {
    return { current: 5, stalled: false }
  }
  if (o.status === "verzonden") return { current: 4, stalled: false }
  if (legs.some((l) => l.state === "fout")) return { current: 1, stalled: true }
  if (legs.length > 0 && legs.every((l) => l.state === "bevestigd")) return { current: 3, stalled: false }
  if (legs.some((l) => l.state !== "te-versturen")) return { current: 2, stalled: false }
  return { current: 1, stalled: false }
}

const GLYPH: Readonly<Record<HistoryLine["kind"], TimelineItem["glyph"]>> = {
  placed: ShoppingBag,
  paid: CreditCard,
  supplier: Box,
  shipped: Truck,
  delivered: Check,
  problem: AlertTriangle,
  money: Banknote,
  note: FileText,
  change: Edit
}

/** The day, and the time when it is today or yesterday. */
const when = (ms: number) => stamp(new Date(ms))

const supplierName = (id: string) => supplier(id)?.name ?? id

type DialogId = "refund" | "cancel" | "note" | "return" | "tags" | "forward" | null

export function OrderRecord({ number }: { readonly number: string }) {
  const view = useView()
  const access = useAccess("orders")
  const state = dataState(view)
  const busy = view.staat === "druk"
  const desk = useDesk()
  const returns = useReturnsState()
  const caseState = useCases()
  const order = deskOrder(number, desk)
  const [dialog, setDialog] = useState<DialogId>(null)
  const [forwardLegs, setForwardLegs] = useState<ReadonlyArray<Leg>>([])
  const addressOpen = useQuery("adres") === "1" && access.edit

  if (!access.view) {
    return (
      <Page width="record">
        <Denied area="orders" what="deze bestelling" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        <PageHead title={`#${number}`} />
        <RecordSkeleton />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <PageHead title={`#${number}`} />
        <LoadError one what="De bestelling" detail={`GET /orders/${number} · 504 · req_c02d4e`} />
      </Page>
    )
  }
  if (order === undefined || state === "empty") {
    return (
      <Page width="record">
        <PageHead title={`#${number}`} />
        <EmptyState
          glyph={ShoppingBag}
          title="Deze bestelling bestaat niet"
          action={<ButtonLink to={paths.orders}>Naar bestellingen</ButtonLink>}
        >
          Er is geen bestelling met nummer #{number}{" "}
          in Northwind EU, US of UK. Misschien is hij samengevoegd of is het nummer verkeerd overgenomen.
        </EmptyState>
      </Page>
    )
  }

  const who = customer(order.customerId)
  const name = busyName(order, busy)
  const legs = orderLegs(order.number, desk)
  const step = stepOf(order, legs)
  const status = statusOf(order)
  const address = desk.address[order.number] ?? baseAddress(order)
  const refunded = desk.refunded[order.number] ?? (order.status === "terugbetaald" ? order.total : 0)
  const left = Math.round((order.total - refunded) * 100) / 100
  const closed = isClosed(order)
  const limit = refundLimit(view.rol)
  const ticket = ORDER_TICKETS[order.number]
  const myReturns = orderReturns(order.number, returns)
  const cases = orderCases(order.number, caseState)
  const proposal = APPROVALS.find((a) =>
    (a.id === "korting-5146" && order.number === "5309") ||
    (a.id === "mail-kestrel" && order.status === "vertraagd" && suppliersOf(order).includes("kestrel-goods"))
  )
  const late = order.status === "vertraagd" ? LATE_STORY[order.number] : undefined
  const subtotal = linesTotal(order.lines)
  const promised = promisedOf(order)
  // A return still waiting for review is the decision about this money; refunding here would skip it.
  const reviewing = myReturns.find((r) => r.status === "te-beoordelen")
  const canRefund = access.edit && !closed && left > 0 && !isConcept(order) && reviewing === undefined
  const canCancel = access.edit && !closed && !shipped(order.status)
  const sendable = legs.filter((l) => l.state === "te-versturen" || l.state === "fout")

  const refund = (amount: number) => {
    const full = amount >= left
    const before = changeDesk((d) => {
      const next = addEvent(
        { ...d, refunded: { ...d.refunded, [order.number]: refunded + amount } },
        order.number,
        `Terugbetaling van ${money(amount)} via ${order.payment} door ${ME.name}`,
        "bad"
      )
      return full ? setStatus(next, [order.number], "terugbetaald") : next
    })
    setDialog(null)
    undoable(
      `${money(amount)} gaat terug naar ${name}`,
      () => restoreDesk(before),
      "Via de oorspronkelijke betaalmethode. Ongedaan maken kan de komende 30 seconden."
    )
  }
  const cancel = () => {
    const before = changeDesk((d) =>
      setStatus(d, [order.number], "geannuleerd", () => `Geannuleerd door ${ME.name}; de klant krijgt een mail`)
    )
    setDialog(null)
    undoable(
      `#${order.number} geannuleerd`,
      () => restoreDesk(before),
      "De klant krijgt de mail na de verzendtijd van 30 seconden."
    )
  }

  const actions = (
    <>
      {reviewing !== undefined && (
        <ButtonLink to={paths.return(reviewing.id)} icon={<Banknote />}>
          Retour {reviewing.number} beoordelen
        </ButtonLink>
      )}
      {canRefund && <Button icon={<Banknote />} onClick={() => setDialog("refund")}>Terugbetalen</Button>}
      {access.edit && sendable.length > 0 && (
        <Button
          variant="primary"
          onClick={() => {
            setForwardLegs(sendable)
            setDialog("forward")
          }}
        >
          Doorsturen
        </Button>
      )}
      <DropdownMenu
        label="Meer acties"
        placement="bottom-end"
        trigger={(props) => (
          <IconButton label="Meer acties" tone="outline" {...props}>
            <MoreHorizontal />
          </IconButton>
        )}
      >
        {access.edit && (
          <DropdownItem glyph={FileText} onSelect={() => setDialog("note")}>
            Interne notitie
          </DropdownItem>
        )}
        {access.edit && (
          <DropdownItem glyph={TagGlyph} onSelect={() => setDialog("tags")}>
            Label toevoegen
          </DropdownItem>
        )}
        {access.edit && !shipped(order.status) && !closed && (
          <DropdownItem
            glyph={MapPin}
            onSelect={() => setQuery({ adres: "1" })}
          >
            Verzendadres wijzigen
          </DropdownItem>
        )}
        {access.edit && (order.status === "bezorgd" || order.status === "verzonden") && (
          <DropdownItem
            glyph={Returns}
            onSelect={() => setDialog("return")}
          >
            Retour starten
          </DropdownItem>
        )}
        <DropdownItem glyph={Copy} onSelect={() => copyText(`#${order.number}`, "Bestelnummer")}>
          Nummer kopiëren
        </DropdownItem>
        {canCancel && (
          <>
            <DropdownSeparator />
            <DropdownItem glyph={XCircle} tone="danger" onSelect={() => setDialog("cancel")}>
              Bestelling annuleren
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </>
  )

  return (
    <Page width="record">
      <PageHead
        title={`#${order.number}`}
        after={<Status tone={status.tone}>{status.label}</Status>}
        meta={
          <>
            <Link to={paths.customer(order.customerId)} className="text-ink-2 hover:underline">{name}</Link>
            {` · geplaatst ${longDate(order.placedAt)} · ${storeName(order.storeId)} · `}
            <span className="figure">{money(order.total)}</span>
          </>
        }
        actions={actions}
      />
      {!access.edit && <ReadOnlyNotice area="orders" />}

      {late !== undefined && <Notice tone="warn" title={late.title}>{late.body}</Notice>}
      {order.status === "vertraagd" && late === undefined && (
        <Notice
          tone="warn"
          title={`Niet bezorgd op ${promised.getDate()} nov, zoals beloofd`}
          action={proposal === undefined && suppliersOf(order)[0] !== undefined
            ? <ButtonLink size="sm" to={paths.supplier(suppliersOf(order)[0] ?? "")}>Leverancier openen</ButtonLink>
            : undefined}
        >
          De leverancier verwerkt deze bestelling trager dan normaal. Vraag {supplierName(suppliersOf(order)[0] ?? "")}
          {" "}
          om de verwachte overdrachtsdatum.
        </Notice>
      )}
      {cases.filter((c) => c.status === "wacht-op-bewijs").map((c) => (
        <Notice
          key={c.id}
          tone="bad"
          title={`${CHANNEL_LABEL[c.channel]} betwist ${money(c.amount)}: ${c.reason.toLowerCase()}`}
          action={<ButtonLink size="sm" to={paths.chargeback(c.id)}>{c.id} openen</ButtonLink>}
        >
          {c.draftedBy === undefined
            ? "Er is nog geen bewijs verzameld."
            : `De ${c.draftedBy.agent} stelde het bewijspakket op; indienen wacht op jou.`}
        </Notice>
      ))}
      {proposal !== undefined && (
        <PageSection title="Wacht op jou" id="voorstel">
          <WaitingProposal item={proposal} primary={false} />
        </PageSection>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {!closed && !isConcept(order) && (
            <Stepper
              label="Waar de bestelling is"
              current={step.current}
              stalled={step.stalled}
              steps={STEPS.map((label, i) => ({
                label,
                ...(i === 0
                  ? { detail: stamp(new Date(order.placedAt.getTime() + 60_000)) }
                  : i === 3 && shipped(order.status)
                  ? { detail: order.carrier }
                  : i === 4
                  ? {
                    detail: order.status === "bezorgd" || order.status === "retour"
                      ? "Bezorgd"
                      : `Belofte ${promised.getDate()} nov`
                  }
                  : {})
              }))}
            />
          )}

          <PageSection
            title="Artikelen"
            id="artikelen"
            meta={`${order.lines.length === 1 ? "1 regel" : `${order.lines.length} regels`}`}
          >
            <Table label="Artikelen" minWidth={340}>
              <THead>
                <Th>Product</Th>
                <Th>Maat</Th>
                <Th align="right">Aantal</Th>
                <Th align="right">Prijs</Th>
                <Th align="right">Bedrag</Th>
              </THead>
              <TBody>
                {order.lines.map((l, i) => {
                  const p = product(l.productId)
                  return (
                    <Tr key={i}>
                      <Td header>
                        <Link to={paths.product(l.productId)} className="text-ink hover:underline">
                          {p?.name ?? l.productId}
                        </Link>
                        <span className="block text-2xs text-ink-3">{supplierName(p?.supplierId ?? "")}</span>
                      </Td>
                      <Td muted>{l.size}</Td>
                      <Td figure>{l.quantity}</Td>
                      <Td figure muted>{money(l.price)}</Td>
                      <Td figure>{money(l.price * l.quantity)}</Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
            <dl className="ml-auto flex w-full max-w-64 flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-4 text-ink-2">
                <dt>Subtotaal</dt>
                <dd className="figure">{money(subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between gap-4 text-ink-2">
                  <dt>Korting</dt>
                  <dd className="figure">− {money(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 text-ink-2">
                <dt>Verzending</dt>
                <dd className="figure">{order.shipping === 0 ? "Gratis" : money(order.shipping)}</dd>
              </div>
              <div className="flex justify-between gap-4 font-medium text-ink">
                <dt>Totaal</dt>
                <dd className="figure">{money(order.total)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-xs text-ink-3">
                <dt>Waarvan btw 21%</dt>
                <dd className="figure">{money(btwOf(order.total))}</dd>
              </div>
              {refunded > 0 && (
                <div className="flex justify-between gap-4 text-bad-ink">
                  <dt>Terugbetaald</dt>
                  <dd className="figure">− {money(refunded)}</dd>
                </div>
              )}
            </dl>
          </PageSection>

          {legs.length > 0 && (
            <PageSection
              title="Bij leverancier"
              id="leveranciers"
              meta={legs.length === 1 ? "1 leverancier" : `${legs.length} leveranciers, elk met eigen regels`}
            >
              <ul className="flex flex-col">
                {legs.map((leg) => {
                  const own = order.lines.filter((l) =>
                    product(l.productId)?.supplierId === (leg.from ?? leg.supplierId)
                  )
                  return (
                    <li key={leg.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <Link to={paths.supplier(leg.supplierId)} className="font-medium text-ink hover:underline">
                            {supplierName(leg.supplierId)}
                          </Link>
                          {leg.from !== undefined && (
                            <span className="text-xs text-ink-3">in plaats van {supplierName(leg.from)}</span>
                          )}
                        </span>
                        <span className="text-xs text-pretty text-ink-3">
                          {own.map((l) => `${l.quantity}× ${product(l.productId)?.name ?? l.productId} · ${l.size}`)
                            .join(", ")}
                          {leg.via !== undefined && ` · ${VIA_LABEL[leg.via]}`}
                        </span>
                        {leg.state === "fout" && leg.note !== undefined && (
                          <span className="text-xs text-bad-ink">{leg.note}</span>
                        )}
                      </div>
                      <LegStatus leg={leg} />
                      {access.edit && (leg.state === "te-versturen" || leg.state === "fout") && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (leg.reason === "adres") {
                              setQuery({ adres: "1" })
                              return
                            }
                            setForwardLegs([leg])
                            setDialog("forward")
                          }}
                        >
                          {leg.reason === "adres"
                            ? "Adres aanpassen"
                            : leg.state === "fout"
                            ? "Opnieuw doorsturen"
                            : "Doorsturen"}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </PageSection>
          )}

          <PageSection
            title="Geschiedenis"
            id="geschiedenis"
            actions={access.edit
              ? <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => setDialog("note")}>Notitie</Button>
              : undefined}
          >
            <Timeline
              label={`Geschiedenis van #${order.number}`}
              items={historyOf(order, desk).map((h) => ({
                id: h.id,
                at: when(h.at),
                glyph: GLYPH[h.kind],
                title: h.title,
                ...(h.body === undefined ? {} : { body: h.body }),
                ...(h.tone === undefined ? {} : { tone: h.tone === "accent" ? "neutral" : h.tone })
              }))}
            />
          </PageSection>
        </div>

        <aside aria-label="Over deze bestelling" className="flex min-w-0 flex-col gap-8">
          <dl className="flex flex-col gap-4">
            <Fact label="Klant">
              <Link to={paths.customer(order.customerId)} className="font-medium hover:underline">{name}</Link>
              <span className="block truncate text-ink-3">{who?.email}</span>
              <span className="block text-ink-3">
                {customerOrders(order.customerId).length === 1
                  ? "Eerste bestelling"
                  : `${customerOrders(order.customerId).length} bestellingen`}
              </span>
            </Fact>
            <Fact label="Verzendadres">
              <address className="not-italic">
                {address.street}
                <br />
                {address.postcode} {address.city}
                <br />
                {countryName(address.country)}
              </address>
            </Fact>
            <Fact label="Verzending">
              <span className="flex items-center gap-2.5">
                <ServiceLogo service={order.carrier} name={order.carrier} size={28} />
                <span className="min-w-0">
                  {order.carrier}
                  {shipped(order.status) && <span className="figure block text-ink-3">{trackingOf(order)}</span>}
                  <span className="block text-ink-3">Beloofd op {promised.getDate()} nov</span>
                </span>
              </span>
            </Fact>
            <Fact label="Betaling">
              {order.payment} · <span className="figure">{money(order.total)}</span>
              <span className="block text-ink-3">
                {isConcept(order)
                  ? "Nog niet betaald"
                  : `Betaald ${stamp(new Date(order.placedAt.getTime() + 60_000))}`}
              </span>
            </Fact>
            {(ownTags(order).length > 0 || access.edit) && (
              <Fact label="Labels">
                <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {ownTags(order).map((t) => <Tag key={t}>{t}</Tag>)}
                  {access.edit && (
                    <button
                      type="button"
                      onClick={() => setDialog("tags")}
                      className="text-xs text-ink-3 hover:text-ink hover:underline pointer-coarse:min-h-11"
                    >
                      Toevoegen
                    </button>
                  )}
                </span>
              </Fact>
            )}
          </dl>

          {(ticket !== undefined || myReturns.length > 0 || cases.length > 0) && (
            <section aria-labelledby="gekoppeld" className="flex flex-col gap-2">
              <h2 id="gekoppeld" className="text-sm font-semibold text-ink">Gekoppeld</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {ticket !== undefined && (
                  <li>
                    <Link to={paths.ticket(ticket.id)} className="text-ink hover:underline">Ticket #{ticket.id}</Link>
                    <span className="block text-xs text-ink-3">{ticket.subject}</span>
                  </li>
                )}
                {myReturns.map((r) => (
                  <li key={r.id}>
                    <Link to={paths.return(r.id)} className="text-ink hover:underline">Retour {r.number}</Link>
                    <span className="block text-xs text-ink-3">{RETURN_STATUS[r.status].label}</span>
                  </li>
                ))}
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link to={paths.chargeback(c.id)} className="text-ink hover:underline">Chargeback {c.id}</Link>
                    <span className="block text-xs text-ink-3">{CASE_STATUS[c.status].label} · {money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <RefundDialog
        key={`refund-${left}`}
        order={{ ...order, total: left }}
        open={dialog === "refund"}
        onClose={() => setDialog(null)}
        limit={limit}
        rol={access.rol}
        onRefund={refund}
      />
      <AlertDialog
        open={dialog === "cancel"}
        onCancel={() => setDialog(null)}
        onConfirm={cancel}
        title={`Bestelling #${order.number} annuleren?`}
        body={`Dit stopt de afhandeling, geeft gereserveerde voorraad vrij en laat het de klant weten. ${
          money(order.total)
        } gaat terug via ${order.payment}. Na de verzendtijd van 30 seconden kun je een annulering niet meer terugdraaien.`}
        confirmLabel="Bestelling annuleren"
        cancelLabel="Bestelling houden"
      />
      <NoteDialog order={order} open={dialog === "note"} onClose={() => setDialog(null)} />
      <StartReturnDialog order={order} open={dialog === "return"} onClose={() => setDialog(null)} />
      <TagDialog orders={dialog === "tags" ? [order] : null} onClose={() => setDialog(null)} />
      <AddressDialog
        key={`${address.street}-${address.city}`}
        order={order}
        address={address}
        open={addressOpen}
        onClose={() => setQuery({ adres: null })}
      />
      <ForwardDialog legs={dialog === "forward" ? forwardLegs : null} onClose={() => setDialog(null)} />
    </Page>
  )
}

import { useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import {
  Calendar,
  ChevronDown,
  Copy,
  CreditCard,
  Factory,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Truck,
  XCircle
} from "../../icons"
import { ConfirmDialog } from "../common/confirm-dialog"
import { DetailShell } from "../common/detail-shell"
import { ProductThumb } from "../product/product-thumb"
import { useAskInsyte } from "../shell/ask-insyte-context"
import { OrderTags } from "./order-tags"

import { formatCurrency, initials, ZONE } from "../lib/format"
import { countryFlag, countryName } from "../lib/format-flag"
import type { Address } from "../lib/types/domain"
import type { Currency } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { type TimelineStep, useOrderDetailSource } from "./detail-source"
import { OrderNoteDialog, ShippingDialog } from "./order-dialogs"
import { OrderStatusBadge } from "./order-status-badge"

/*
 * One order, as `detail-source.tsx` gives it: the design app's from its demo workspace, the console's from
 * `Orders.get`. What the host cannot do yet is left out rather than shown dead: without `writes` there is no Acties
 * menu, no Bewerken and no advice; without a supplier no supplier line.
 */

const STEP_ICON: Record<TimelineStep["kind"], typeof Calendar> = {
  placed: Calendar,
  paid: CreditCard,
  supplier: Factory,
  shipped: Truck,
  delivered: MapPin,
  closed: XCircle
}

export function OrderDetailPage() {
  const {
    order,
    customer,
    imageOf,
    skuOf,
    totals,
    timeline,
    payment,
    supplier,
    arriving,
    checkoutNote,
    tags,
    writes,
    Tracker,
    AgentRows,
    Returns
  } = useOrderDetailSource()
  const ask = useAskInsyte()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [shippingOpen, setShippingOpen] = useState(false)
  const [adviceDismissed, setAdviceDismissed] = useState(false)
  const closed = order.status === "cancelled" || order.status === "refunded"
  const [returnOpen, setReturnOpen] = useState(false)

  function draftSupplierMessage(to: string) {
    writes?.draftSupplierMessage(to)
    setAdviceDismissed(true)
  }

  const status = order.tags.includes("at_risk")
    ? ("delayed" as const)
    : order.status
  const country = order.shipping_address?.country
  const address = order.shipping_address
  const region = address ? [address.region, address.postal_code].filter(Boolean).join(" ") : ""

  const itemsSubtotal = totals.subtotal
  const { shipping, tax } = totals

  return (
    <DetailShell
      crumb={{ label: "Bestellingen", to: "/orders" }}
      arriving={arriving}
      title={order.number}
      badge={<OrderStatusBadge status={status} />}
      meta={
        <>
          {formatLong(order.created_at)} · {formatCurrency(order.total, order.currency)} ·{" "}
          {order.line_count ?? order.line_items.length}{" "}
          {(order.line_count ?? order.line_items.length) === 1 ? "artikel" : "artikelen"}
        </>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(order.number)
              toast.success("Bestelnummer gekopieerd")
            }}
            aria-label="Bestelnummer kopiëren"
            className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <Copy className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => ask.open()}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc-tint"
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            Vraag Insyte
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <Printer className="size-3.5" strokeWidth={1.75} />
            Afdrukken
          </button>
          {writes ?
            (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
                  >
                    Acties
                    <ChevronDown className="size-3.5" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Bestelacties</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={closed || order.fulfillment_status === "fulfilled" || !writes.gates.edit.ok}
                    onClick={writes.fulfil}
                  >
                    <Truck strokeWidth={1.75} />
                    Als afgehandeld markeren
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={order.payment_status === "refunded" || !writes.gates.refund.ok}
                    onClick={() => setRefundOpen(true)}
                    className={writes.gates.refund.ok ? undefined : "h-auto py-1.5"}
                  >
                    {writes.gates.refund.ok ? <RefreshCcw strokeWidth={1.75} /> : <Lock strokeWidth={1.75} />}
                    <span className="flex min-w-0 flex-col">
                      Terugbetalen
                      {writes.gates.refund.ok
                        ? null
                        : <span className="text-ink-3 text-xs leading-snug">{writes.gates.refund.reason}</span>}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!writes.gates.edit.ok} onClick={() => setNoteOpen(true)}>
                    <MessageSquare strokeWidth={1.75} />
                    Interne notitie toevoegen
                  </DropdownMenuItem>
                  {Returns ?
                    (
                      <DropdownMenuItem disabled={!writes.gates.returns.ok} onClick={() => setReturnOpen(true)}>
                        <RotateCcw strokeWidth={1.75} />
                        Retour starten
                      </DropdownMenuItem>
                    ) :
                    null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={closed || !writes.gates.edit.ok}
                    onClick={() => setCancelOpen(true)}
                  >
                    <XCircle strokeWidth={1.75} />
                    Bestelling annuleren
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) :
            null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* AI Recommendation — mesh-dark, the brand's voice when AI speaks. */}
        {writes && supplier && !adviceDismissed && !closed && (status === "delayed" || order.tags.includes("at_risk")) ?
          (
            <section className="flex w-full items-start justify-between gap-4 rounded-xl bg-abyss p-5 text-mesh-ink">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-md bg-mesh-ink/10 ">
                    <Sparkles
                      className="size-3 text-mesh-ink"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="font-medium text-sm text-mesh-ink leading-none">
                    Insyte AI
                  </span>
                  <span className="font-medium text-2xs text-mesh-ink/30 leading-none">·</span>
                  <span className="font-medium text-sm text-mesh-ink/70 leading-none">
                    Aanbeveling
                  </span>
                </div>
                <p className="max-w-[64ch] text-base text-mesh-ink/85 leading-[1.55]">
                  <span className="font-medium text-mesh-ink">
                    De leverancier verwerkt deze bestelling trager dan normaal.
                  </span>{" "}
                  Vraag {supplier} om de verwachte overdrachtsdatum.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdviceDismissed(true)}
                  className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-mesh-ink/70 leading-none tracking-[-0.05px] transition-colors hover:bg-mesh-ink/8 hover:text-mesh-ink"
                >
                  Negeren
                </button>
                <button
                  type="button"
                  onClick={() => draftSupplierMessage(supplier)}
                  className="flex h-9 items-center justify-center rounded-md bg-paper px-3.5 font-medium text-base text-ink leading-none tracking-[-0.05px] shadow-on-mesh transition-colors hover:bg-arc-tint"
                >
                  Bericht opstellen
                </button>
              </div>
            </section>
          ) :
          null}

        {/* Body: 2-col layout */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-5">
            {Tracker ? <Tracker order={order} /> : null}
            {/* Line items */}
            <section className="overflow-hidden rounded-xl panel">
              <header className="flex items-center justify-between px-5 pt-4 pb-1">
                <h2 className="font-medium text-md text-ink">
                  Artikelen
                </h2>
                <span className="font-medium text-sm text-ink-3 leading-[1.2]">
                  {order.line_items.length} {order.line_items.length === 1 ? "artikel" : "artikelen"}
                </span>
              </header>
              <ul>
                {order.line_items.map((li) => (
                  <li
                    key={li.id}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <ProductThumb src={imageOf(li)} title={li.title} size={48} className="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-base text-ink leading-[1.4]">
                        {li.title}
                      </p>
                      <p className="truncate font-normal text-sm text-ink-3 leading-[1.4]">
                        {skuOf(li) ? <>SKU {skuOf(li)} · Aantal</> : "Aantal "}
                        {li.quantity}
                        {li.variant_title ? ` · ${li.variant_title}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium text-base text-ink leading-[1.2]">
                      {formatCurrency(
                        li.unit_price * li.quantity,
                        order.currency
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Totals */}
              <div className="mt-2 bg-mist px-5 py-4">
                <TotalsRow
                  label="Subtotaal"
                  value={itemsSubtotal}
                  currency={order.currency}
                />
                <TotalsRow
                  label="Verzending"
                  value={shipping}
                  currency={order.currency}
                />
                <TotalsRow label="Btw" value={tax} currency={order.currency} />
                {totals.discount > 0 ?
                  <TotalsRow label="Korting" value={-totals.discount} currency={order.currency} /> :
                  null}
                <div className="mt-2 border-hairline border-t pt-2">
                  <TotalsRow
                    label="Totaal"
                    value={order.total}
                    currency={order.currency}
                    bold
                  />
                </div>
              </div>
            </section>

            {/* Timeline */}
            <section className="overflow-hidden rounded-xl panel">
              <header className="flex items-center justify-between px-5 pt-4 pb-1">
                <h2 className="font-medium text-md text-ink">
                  Tijdlijn
                </h2>
              </header>
              <ol className="flex flex-col px-5 py-4">
                {timeline.map((t, i) => {
                  const Icon = STEP_ICON[t.kind]
                  return (
                    <li key={t.label} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full",
                            t.done ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-3"
                          )}
                        >
                          <Icon className="size-3.5" strokeWidth={2} />
                        </span>
                        {i < timeline.length - 1 ?
                          (
                            <span
                              className={cn(
                                "w-px flex-1",
                                t.done ? "bg-abyss/40" : "bg-hairline"
                              )}
                            />
                          ) :
                          null}
                      </div>
                      <div className="flex flex-1 flex-col pb-3">
                        <p className="font-medium text-base text-ink leading-[1.4]">
                          {t.label}
                        </p>
                        <p className="font-normal text-sm text-ink-3 leading-[1.4]">
                          {t.detail}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              {AgentRows ?
                (
                  <div className="px-5 pb-4">
                    <AgentRows order={order} />
                  </div>
                ) :
                null}
            </section>
          </div>

          {/* Sidebar */}
          {Returns ? <Returns.Dialog order={order} open={returnOpen} onClose={() => setReturnOpen(false)} /> : null}
          <aside className="flex flex-col gap-5">
            {/* Customer */}
            <section className="flex flex-col gap-3 rounded-xl panel p-5">
              <h3 className="font-normal text-base text-ink-2 leading-[1.55]">
                Klant
              </h3>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-arc font-medium text-base text-mesh-ink">
                  {initials(order.customer_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-base text-ink leading-[1.4]">
                    {order.customer_name}
                  </p>
                  <p className="truncate font-normal text-sm text-ink-3 leading-[1.4]">
                    {customer
                      ? `${customer.orders_count} ${customer.orders_count === 1 ? "bestelling" : "bestellingen"} · ${
                        formatCurrency(customer.lifetime_value, customer.currency)
                      } CLV`
                      : "Gastbestelling"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-hairline border-t pt-3">
                <SidebarLine icon={Mail} text={order.customer_email} />
                {customer?.phone ? <SidebarLine icon={Phone} text={customer.phone} /> : null}
              </div>
            </section>

            {/* Shipping */}
            <section className="flex flex-col gap-3 rounded-xl panel p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-normal text-base text-ink-2 leading-[1.55]">
                  Verzending
                </h3>
                {writes ?
                  (
                    <button
                      type="button"
                      onClick={() => setShippingOpen(true)}
                      className="font-medium text-sm text-arc-ink leading-[1.2] hover:underline"
                    >
                      Bewerken
                    </button>
                  ) :
                  null}
              </div>
              <div className="flex items-start gap-2">
                {country ?
                  (
                    <span className="mt-0.5 text-base leading-none">
                      {countryFlag(country)}
                    </span>
                  ) :
                  null}
                <div className="flex flex-col">
                  <p className="font-medium text-base text-ink leading-[1.4]">
                    {order.customer_name}
                  </p>
                  {address ?
                    (
                      <p className="font-normal text-sm text-ink-3 leading-[1.6]">
                        {address.line1}
                        <br />
                        {address.city}
                        {address.city ? "," : null}
                        {address.city && region ? " " : null}
                        {address.region}
                        {address.region && address.postal_code ? " " : null}
                        {address.postal_code}
                        <br />
                        {country ? countryName(country) : null}
                      </p>
                    ) :
                    null}
                </div>
              </div>
              {supplier ? <SidebarLine icon={Truck} text={supplier} /> : null}
            </section>

            {/* Payment */}
            <section className="flex flex-col gap-3 rounded-xl panel p-5">
              <h3 className="font-normal text-base text-ink-2 leading-[1.55]">
                Betaling
              </h3>
              <SidebarLine
                icon={CreditCard}
                text={`${PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status} · ${payment.method}`}
              />
              {payment.collectedAt ?
                (
                  <SidebarLine
                    icon={Calendar}
                    text={`Geïnd op ${formatLong(payment.collectedAt)}`}
                  />
                ) :
                null}
            </section>

            {order.notes ?
              (
                <section className="flex flex-col gap-2 rounded-xl bg-signal-amber-bg/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm text-ink-2">Interne notitie</h3>
                    {writes ?
                      (
                        <button
                          type="button"
                          onClick={() => setNoteOpen(true)}
                          className="font-medium text-sm text-arc-ink hover:underline"
                        >
                          Bewerken
                        </button>
                      ) :
                      null}
                  </div>
                  <p className="whitespace-pre-line text-base text-ink">{order.notes}</p>
                </section>
              ) :
              null}

            {checkoutNote ?
              (
                <section className="flex flex-col gap-2 rounded-xl panel p-5">
                  <h3 className="font-normal text-base text-ink-2 leading-[1.55]">Opmerking van de klant</h3>
                  <p className="whitespace-pre-line text-base text-ink">{checkoutNote}</p>
                </section>
              ) :
              null}

            <OrderTags order={order} known={tags.known} write={tags.write} />
            {Returns ? <Returns.Panel order={order} onStart={() => setReturnOpen(true)} /> : null}
          </aside>
        </div>
        {writes ?
          (
            <>
              <ConfirmDialog
                open={cancelOpen}
                onOpenChange={setCancelOpen}
                title={`Bestelling ${order.number} annuleren?`}
                description="Dit stopt de afhandeling, geeft gereserveerde voorraad vrij en laat het de klant weten. Een annulering kun je niet terugdraaien."
                confirmLabel="Bestelling annuleren"
                cancelLabel="Bestelling houden"
                tone="destructive"
                onConfirm={() => {
                  writes.cancel()
                  setCancelOpen(false)
                }}
              />
              <ConfirmDialog
                open={refundOpen}
                onOpenChange={setRefundOpen}
                title={`${
                  formatCurrency(writes.refundable ?? order.total, order.currency)
                } terugbetalen aan ${order.customer_name}?`}
                description="Het geld gaat terug via de oorspronkelijke betaalmethode, meestal binnen vijf werkdagen. Een verstuurde terugbetaling kun je niet terughalen."
                confirmLabel="Volledig terugbetalen"
                onConfirm={() => {
                  writes.refund()
                  setRefundOpen(false)
                }}
              />
              <OrderNoteDialog
                open={noteOpen}
                onOpenChange={setNoteOpen}
                initial={order.notes ?? ""}
                onSave={writes.saveNote}
              />
              <ShippingDialog
                open={shippingOpen}
                onOpenChange={setShippingOpen}
                name={order.customer_name}
                initial={order.shipping_address}
                onSave={(next: Address) => writes.saveShipping(next)}
              />
            </>
          ) :
          null}
      </div>
    </DetailShell>
  )
}

function TotalsRow({
  label,
  value,
  currency,
  bold
}: {
  label: string
  value: number
  currency?: Currency
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={cn(
          "text-base leading-[1.4]",
          bold ? "font-medium text-ink" : "font-medium text-ink-3"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-base leading-[1.4]",
          bold ? "font-medium text-ink" : "font-normal text-ink"
        )}
      >
        {formatCurrency(value, currency)}
      </span>
    </div>
  )
}

function SidebarLine({
  icon: Icon,
  text
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  text: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-ink-3" strokeWidth={1.75} />
      <span className="truncate font-normal text-sm text-ink leading-[1.4]">
        {text}
      </span>
    </div>
  )
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "In afwachting",
  paid: "Betaald",
  refunded: "Terugbetaald",
  voided: "Vervallen"
}

/** A moment as the record writes it, in Dutch time on the server and in the browser alike. */
export function formatLong(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso))
}

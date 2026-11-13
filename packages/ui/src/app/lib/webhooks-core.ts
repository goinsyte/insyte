import { D } from "./developer-core"
import { AREA_BY_ID, type AreaId, type StoreScope } from "./permissions"

/*
 * Webhooks' records and the pure facts about them (Instellingen → Webhooks), apart from the demo's seeded deliveries:
 * the event catalogue (the server's is `@insyte/domain/Webhooks`, kept equal by `test/webhook-events.test.ts`), the
 * endpoint and delivery shapes the screens read, and their health. `lib/developer.ts` re-exports these with the seeds.
 */

export type EventGroup = {
  area: AreaId | "inventory" | "refunds"
  label: string
  events: ReadonlyArray<{ id: string; label: string }>
}

/** Every event Insyte can post, grouped the way the product is. */
export const EVENT_GROUPS: ReadonlyArray<EventGroup> = [
  {
    area: "orders",
    label: AREA_BY_ID.orders.label,
    events: [
      { id: "order.created", label: "Bestelling geplaatst" },
      { id: "order.paid", label: "Bestelling betaald" },
      { id: "order.fulfilled", label: "Bestelling verzonden" },
      { id: "order.delivered", label: "Bestelling bezorgd" },
      { id: "order.refunded", label: "Bestelling terugbetaald" },
      { id: "order.cancelled", label: "Bestelling geannuleerd" },
      { id: "order.delayed", label: "Bestelling vertraagd" }
    ]
  },
  {
    area: "refunds",
    label: "Terugbetalingen",
    events: [
      { id: "refund.created", label: "Terugbetaling gemaakt" },
      { id: "refund.failed", label: "Terugbetaling mislukt" }
    ]
  },
  {
    area: "customers",
    label: AREA_BY_ID.customers.label,
    events: [
      { id: "customer.created", label: "Klant aangemaakt" },
      { id: "customer.updated", label: "Klant bijgewerkt" },
      { id: "customer.merged", label: "Klanten samengevoegd" },
      { id: "customer.blocked", label: "Klant geblokkeerd" }
    ]
  },
  {
    area: "products",
    label: AREA_BY_ID.products.label,
    events: [
      { id: "product.created", label: "Product aangemaakt" },
      { id: "product.updated", label: "Product bijgewerkt" },
      { id: "product.archived", label: "Product gearchiveerd" }
    ]
  },
  {
    area: "inventory",
    label: "Voorraad",
    events: [
      { id: "inventory.low", label: "Lage voorraad" },
      { id: "inventory.out", label: "Uitverkocht" }
    ]
  },
  {
    area: "support",
    label: AREA_BY_ID.support.label,
    events: [
      { id: "ticket.created", label: "Ticket aangemaakt" },
      { id: "ticket.replied", label: "Ticket beantwoord" },
      { id: "ticket.assigned", label: "Ticket toegewezen" },
      { id: "ticket.closed", label: "Ticket gesloten" }
    ]
  },
  {
    area: "chargebacks",
    label: AREA_BY_ID.chargebacks.label,
    events: [
      { id: "chargeback.opened", label: "Chargeback geopend" },
      { id: "chargeback.evidence_due", label: "Bewijsdeadline nadert" },
      { id: "chargeback.won", label: "Chargeback gewonnen" },
      { id: "chargeback.lost", label: "Chargeback verloren" }
    ]
  },
  {
    area: "suppliers",
    label: AREA_BY_ID.suppliers.label,
    events: [
      { id: "supplier.delay_reported", label: "Vertraging gemeld" },
      { id: "supplier.message", label: "Bericht van leverancier" },
      { id: "supplier.order_accepted", label: "Bestelling geaccepteerd" }
    ]
  },
  {
    area: "automations",
    label: AREA_BY_ID.automations.label,
    events: [
      { id: "automation.run.completed", label: "Uitvoering geslaagd" },
      { id: "automation.run.failed", label: "Uitvoering mislukt" },
      { id: "automation.published", label: "Flow gepubliceerd" }
    ]
  },
  {
    area: "affiliates",
    label: AREA_BY_ID.affiliates.label,
    events: [
      { id: "affiliate.applied", label: "Aanmelding binnen" },
      { id: "affiliate.approved", label: "Affiliate goedgekeurd" },
      { id: "affiliate.payout.approved", label: "Uitbetaling goedgekeurd" }
    ]
  }
]

export const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.id))
export const EVENT_LABEL: Record<string, string> = Object.fromEntries(
  EVENT_GROUPS.flatMap((g) => g.events.map((e) => [e.id, e.label]))
)

export const API_VERSIONS = ["2026-10-01", "2026-07-01", "2026-04-01"] as const
export type ApiVersion = (typeof API_VERSIONS)[number]

export const RETRY: ReadonlyArray<{ id: 0 | 3 | 5 | 8; label: string; detail: string }> = [
  { id: 0, label: "Geen", detail: "Eén poging. Mislukt is mislukt." },
  { id: 3, label: "3 pogingen", detail: "Na 1 min, 10 min en 1 uur." },
  { id: 5, label: "5 pogingen", detail: "Tot 6 uur na de eerste poging." },
  { id: 8, label: "8 pogingen", detail: "Tot 3 dagen na de eerste poging." }
]

/** Consecutive failed deliveries after which Insyte stops sending to an endpoint. */
export const AUTO_DISABLE_AFTER = 5

export type WebhookEndpoint = {
  id: string
  url: string
  description: string
  events: string[]
  apiVersion: ApiVersion
  stores: StoreScope
  secret: string
  secretRotatedAt?: string
  headers: Array<{ key: string; value: string }>
  retry: 0 | 3 | 5 | 8
  /** Switched on by the operator. */
  active: boolean
  /** Switched off by Insyte after too many failures in a row. */
  autoDisabled?: boolean
  /** Failed deliveries in a row, counted from the newest. */
  failures: number
  created_at: string
  created_by: string
}

export type Delivery = {
  id: string
  endpointId: string
  event: string
  /** `null` is a timeout: nothing came back. */
  status: number | null
  attempts: number
  ms: number
  at: string
  nextRetry?: string
  test?: boolean
  request: Record<string, unknown>
  response: string
  /** Why nothing came back (`timeout`, `network`, `dns`, `private_address`); the demo leaves it out. */
  error?: string
  /** `Insyte-Signature` as it was sent; the demo draws one from the secret. */
  signature?: string
  /** The attempts its policy allows; the demo takes the endpoint's. */
  maxAttempts?: number
  /** The body and the answer are held back: the viewer's role does not read the event's records. */
  redacted?: boolean
}

/** What the drawer says in place of a body the viewer's role may not read. */
export const REDACTED = "Je rol mag deze gegevens niet zien."

export const delivered = (d: Delivery) => d.status !== null && d.status >= 200 && d.status < 300

export type Health = { rate: number | null; count: number; failed: number }

/** Share of deliveries in the last 24 hours that got a 2xx back. */
export function health(deliveries: ReadonlyArray<Delivery>, at = Date.now()): Health {
  const recent = deliveries.filter((d) => at - Date.parse(d.at) <= D)
  const ok = recent.filter(delivered).length
  return { rate: recent.length ? (ok / recent.length) * 100 : null, count: recent.length, failed: recent.length - ok }
}

export type EndpointState = "active" | "failing" | "disabled" | "paused" | "new"

export function endpointState(w: WebhookEndpoint, deliveries: ReadonlyArray<Delivery>): EndpointState {
  if (w.autoDisabled) return "disabled"
  if (!w.active) return "paused"
  if (w.failures > 0) return "failing"
  return deliveries.length === 0 ? "new" : "active"
}

/** A delivery that got nothing back in time (or, in the demo, nothing at all). */
export const timedOut = (d: Delivery) => d.status === null && (d.error === undefined || d.error === "timeout")

/** Why an attempt got no answer, as the drawer says it. */
export const DELIVERY_ERROR: Record<string, string> = {
  timeout: "Geen antwoord binnen 10 seconden. Insyte heeft de verbinding verbroken.",
  network: "Het endpoint was niet bereikbaar. Insyte kon geen verbinding maken.",
  dns: "De naam van het endpoint bestaat niet. Controleer de URL.",
  private_address: "Deze URL wijst naar een intern netwerk. Daar stuurt Insyte niets heen.",
  invalid_url: "Dit is geen geldige URL.",
  pending: "Nog niet verstuurd. De eerste poging volgt zo.",
  cancelled: "Niet verstuurd: het endpoint stond uit of is verwijderd.",
  internal: "Niet verstuurd door een storing bij Insyte. Verstuur het opnieuw."
}

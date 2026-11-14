import type { RecordKind } from "./Steps.ts"
import { STEPS_BY_ID } from "./Steps.ts"

/*
 * The fields a step may reference as `{{field}}` (widgets/05 §1.4, "Velden invoegen"): what the trigger's record
 * carries. A reference outside this list cannot be filled in when the flow runs, so publishing refuses it.
 */

export interface TriggerField {
  readonly path: string
  readonly label: string
  /** What the value looks like, for the picker. */
  readonly example: string
}

const TRIGGER: ReadonlyArray<TriggerField> = [
  { path: "trigger.summary", label: "Wat er gebeurde", example: "Bestelling #1042 verzonden" }
]

const CUSTOMER: ReadonlyArray<TriggerField> = [
  { path: "customer.email", label: "E-mail klant", example: "anna@voorbeeld.nl" },
  { path: "customer.first_name", label: "Voornaam klant", example: "Anna" },
  { path: "customer.name", label: "Naam klant", example: "Anna de Vries" },
  { path: "customer.lifetime_value", label: "Totale waarde klant", example: "€ 1.240,00" }
]

const ORDER: ReadonlyArray<TriggerField> = [
  { path: "order.number", label: "Bestelnummer", example: "#1042" },
  { path: "order.total", label: "Totaal bestelling", example: "129,95" },
  { path: "order.status", label: "Status bestelling", example: "verzonden" },
  { path: "order.country", label: "Verzendland", example: "Duitsland" },
  { path: "order.tracking_url", label: "Track & trace-link", example: "https://…" },
  { path: "order.supplier", label: "Leverancier", example: "Yiwu Trading" },
  { path: "order.expected_delivery", label: "Verwachte levering", example: "21 november" }
]

const BY_RECORD: Readonly<Record<RecordKind, ReadonlyArray<TriggerField>>> = {
  order: [...TRIGGER, ...ORDER, ...CUSTOMER],
  chargeback: [
    ...TRIGGER,
    { path: "chargeback.reason", label: "Reden geschil", example: "Niet ontvangen" },
    { path: "chargeback.amount", label: "Bedrag geschil", example: "89,00" },
    { path: "chargeback.due_at", label: "Antwoorddeadline", example: "21 nov" },
    ...ORDER,
    ...CUSTOMER
  ],
  product: [
    ...TRIGGER,
    { path: "product.title", label: "Product", example: "Linnen overhemd" },
    { path: "product.sku", label: "SKU", example: "LIN-042-M" },
    { path: "product.stock", label: "Voorraad", example: "12" }
  ],
  conversation: [
    ...TRIGGER,
    { path: "conversation.subject", label: "Onderwerp gesprek", example: "Waar blijft mijn pakket?" },
    { path: "conversation.last_message", label: "Laatste bericht", example: "Ik wacht al een week…" },
    ...CUSTOMER,
    { path: "order.number", label: "Bestelnummer", example: "#1042" }
  ],
  customers: [...TRIGGER, ...CUSTOMER],
  payload: [...TRIGGER, { path: "payload.body", label: "Inhoud webhook", example: "{ … }" }]
}

/** The fields a flow started by this trigger can reference; none for a step that is not a trigger. */
export const fieldsOf = (triggerVariant: string): ReadonlyArray<TriggerField> => {
  const record = STEPS_BY_ID[triggerVariant]?.record
  return record === undefined ? [] : BY_RECORD[record]
}

const REFERENCE = /\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/g

/** Every `{{field}}` a text holds. */
export const referencesIn = (text: string): ReadonlyArray<string> => [...text.matchAll(REFERENCE)].map((m) => m[1]!)

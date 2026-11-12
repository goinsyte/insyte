import type {
  ChargebackDetail,
  ChargebackEvent,
  ChargebackRow,
  ReasonCode
} from "@insyte/modules/chargebacks/domain/Chargebacks"
import { REASONS } from "@insyte/ui/app/chargebacks/source"
import type { Chargeback, Currency } from "@insyte/ui/app/lib/types/domain"

/*
 * The server's chargebacks as the design's `Chargeback` (M13): money in major units, times as ISO strings, the reason
 * in the dialog's words, the timeline newest first and in Dutch, as the design's store keeps it. A row from the list
 * knows how many files its pack holds, not which: the case's page reads them.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const PROVIDER: Record<ChargebackRow["provider"], string> = { stripe: "Stripe", klarna: "Klarna", paypal: "PayPal" }

/** The dialog's reasons, in `ReasonCode`'s order. */
const REASON_CODES: ReadonlyArray<ReasonCode> = [
  "unauthorized",
  "not_received",
  "wrong_item",
  "not_as_described",
  "refund_requested",
  "service",
  "payment_dispute"
]

const NORMALISED: Record<ChargebackRow["reason"], string> = {
  item_not_received: "Niet ontvangen",
  not_as_described: "Product niet zoals beschreven",
  unauthorized: "Niet-geautoriseerde transactie",
  duplicate: "Dubbele afschrijving",
  other: "Andere reden"
}

const reasonLabel = (row: Pick<ChargebackRow, "reason" | "reasonCode">) => {
  const i = REASON_CODES.indexOf(row.reasonCode as ReasonCode)
  return i >= 0 ? REASONS[i]! : NORMALISED[row.reason]
}

export const reasonCodeOf = (label: string): ReasonCode =>
  REASON_CODES[REASONS.indexOf(label as (typeof REASONS)[number])] ?? "payment_dispute"

const OFFSET: Record<string, string> = {
  "5d": "Nog 5 dagen tot de bewijsdeadline",
  "2d": "Nog 2 dagen tot de bewijsdeadline",
  "6h": "Nog 6 uur tot de bewijsdeadline"
}

const files = (n: number) => `${n} ${n === 1 ? "bestand" : "bestanden"}`

const eventOf = (e: ChargebackEvent, provider: string): string => {
  const names = Array.isArray(e.data["names"]) ? (e.data["names"] as Array<string>) : []
  switch (e.kind) {
    case "opened":
      return e.data["manual"] === true ? "Zaak handmatig geopend" : `Geopend door ${provider}`
    case "evidence_added":
      return `${names.length === 1 ? names[0] : files(names.length)} toegevoegd`
    case "evidence_removed":
      return `${String(e.data["name"] ?? "Bestand")} verwijderd`
    case "pack_assembled":
      return "Bewijspakket opgesteld"
    case "submitted":
      return `Bewijs ingediend bij ${provider}`
    case "accepted":
      return "Geschil geaccepteerd · zaak verloren"
    case "won":
      return "Gewonnen"
    case "lost":
      return "Verloren"
    case "deadline_reminder":
      return OFFSET[String(e.data["offset"])] ?? "De bewijsdeadline nadert"
    case "note":
      return "Notitie bijgewerkt"
  }
}

export const chargebackOf = (row: ChargebackRow): Chargeback => ({
  id: row.id,
  case_number: row.caseNumber,
  provider: row.provider,
  customer_id: row.customerId ?? "",
  customer_name: row.customerName,
  amount: row.amountMinor / 100,
  currency: row.currency as Currency,
  reason: reasonLabel(row),
  status: row.status,
  deadline_at: iso(row.deadlineAt),
  opened_at: iso(row.openedAt),
  // The list counts the pack; the case's page names its files.
  evidence_files: Array.from({ length: row.evidenceCount }, () => ({ name: "", size: 0, kind: "upload" })),
  timeline: [],
  ...(row.orderNumber === null ? {} : { order_id: row.orderNumber }),
  ...(row.note === "" ? {} : { notes: row.note })
})

export const caseOf = (detail: ChargebackDetail): Chargeback => ({
  ...chargebackOf(detail.chargeback),
  evidence_files: detail.evidence.map((e) => ({
    name: e.name,
    size: e.sizeBytes,
    kind: e.source === "insyte" ? e.kind : "upload"
  })),
  timeline: detail.timeline.toReversed().map((e) => ({
    at: iso(e.at),
    actor: e.actor.name,
    event: eventOf(e, PROVIDER[detail.chargeback.provider])
  }))
})

export const providerName = (provider: ChargebackRow["provider"]) => PROVIDER[provider]

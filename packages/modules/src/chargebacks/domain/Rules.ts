import type { Provider, Reason, ReasonCode } from "./Chargebacks.ts"

/*
 * The rules of a case (M13 step 3): which normalised reason each of the dialog's reasons is, how long a case opened by
 * hand has, and when the team hears its deadline is coming.
 */

const REASON_OF: Record<ReasonCode, Reason> = {
  unauthorized: "unauthorized",
  not_received: "item_not_received",
  wrong_item: "not_as_described",
  not_as_described: "not_as_described",
  refund_requested: "other",
  service: "other",
  payment_dispute: "other"
}

export const reasonOf = (code: ReasonCode): Reason => REASON_OF[code]

/** The dialog's reasons in its words (`REASONS` in the screens' `chargebacks/source.tsx`), for the pack's documents. */
const REASON_LABEL: Record<ReasonCode, string> = {
  unauthorized: "Niet-geautoriseerde transactie",
  not_received: "Niet ontvangen",
  wrong_item: "Verkeerd artikel verzonden",
  not_as_described: "Product niet zoals beschreven",
  refund_requested: "Terugbetaling aangevraagd",
  service: "Service niet naar tevredenheid",
  payment_dispute: "Betalingsgeschil"
}

const NORMALISED_LABEL: Record<Reason, string> = {
  item_not_received: "Niet ontvangen",
  not_as_described: "Product niet zoals beschreven",
  unauthorized: "Niet-geautoriseerde transactie",
  duplicate: "Dubbele afschrijving",
  other: "Andere reden"
}

/** A case's reason as the team reads it: the dialog's words for its code, else the normalised reason's. */
export const reasonLabel = (code: string, reason: Reason): string =>
  REASON_LABEL[code as ReasonCode] ?? NORMALISED_LABEL[reason]

/** A case opened by hand has fourteen days for its evidence (domain.md §8). */
export const MANUAL_DEADLINE_MS = 14 * 86_400_000

const HOUR_MS = 3_600_000

/**
 * The reminders before a deadline, farthest first (domain.md §8: T−5 d, T−2 d, T−6 h). The hourly sweep sends the
 * nearest one whose moment has passed, once per deadline; the ones it skipped past (a case opened two days out) are not
 * sent late.
 */
export const REMINDERS: ReadonlyArray<{ readonly offset: "5d" | "2d" | "6h"; readonly beforeMs: number }> = [
  { offset: "5d", beforeMs: 5 * 24 * HOUR_MS },
  { offset: "2d", beforeMs: 2 * 24 * HOUR_MS },
  { offset: "6h", beforeMs: 6 * HOUR_MS }
]

/** The reminder due at `now` for a deadline, if any: the nearest whose moment has passed. */
export const reminderDue = (deadlineAt: number, now: number) => {
  if (deadlineAt <= now) return undefined
  const left = deadlineAt - now
  const passed = REMINDERS.filter((r) => left <= r.beforeMs)
  return passed[passed.length - 1]
}

/** How a provider is named on screen and in a mail: its brand. */
export const PROVIDER_NAME: Record<Provider, string> = { stripe: "Stripe", klarna: "Klarna", paypal: "PayPal" }

/** Open or waiting for evidence: the cases that still need the team. */
export const OPEN_STATUSES = ["open", "awaiting_evidence"] as const

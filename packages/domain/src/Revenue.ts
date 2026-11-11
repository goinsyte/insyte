/*
 * What revenue is, once for every screen (widgets/02 §0.1): an order counts when it is not a draft, not cancelled or
 * refunded, and paid (`paid` or `partially_refunded`). It counts at its total; a partial refund is not subtracted, that
 * is Analyse's net figure. The status is read as it is now, so an order refunded later leaves the revenue of the day
 * it was placed. Start's SQL sums the same rows (`home/use-cases/figures.ts`); the worker test holds the two together
 * over the same orders, the start of ADR-0017's golden rule.
 */

export const COUNTED_PAYMENT = ["paid", "partially_refunded"] as const
export const UNCOUNTED_STATUS = ["cancelled", "refunded"] as const

export interface RevenueOrder {
  readonly status: string
  readonly paymentStatus: string
  readonly isDraft: boolean
  readonly totalMinor: number
  /** The day it was placed, in its store's timezone (YYYY-MM-DD). */
  readonly placedDay: string
}

/** Whether the order counts toward revenue. */
export const counts = (o: RevenueOrder): boolean =>
  !o.isDraft &&
  !(UNCOUNTED_STATUS as ReadonlyArray<string>).includes(o.status) &&
  (COUNTED_PAYMENT as ReadonlyArray<string>).includes(o.paymentStatus)

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** The days of a window of `days` ending on `today` (YYYY-MM-DD), and the window before it. */
export const windowOf = (today: string, days: number, offset = 0): { readonly from: string; readonly to: string } => {
  const end = Date.parse(`${today}T00:00:00Z`) - offset * days * 86_400_000
  return { from: isoDay(end - (days - 1) * 86_400_000), to: isoDay(end) }
}

/** Counted orders and their value in a window of placed days, both ends included. */
export const revenueIn = (
  orders: ReadonlyArray<RevenueOrder>,
  window: { readonly from: string; readonly to: string }
): { readonly count: number; readonly totalMinor: number } => {
  const counted = orders.filter((o) => counts(o) && o.placedDay >= window.from && o.placedDay <= window.to)
  return { count: counted.length, totalMinor: counted.reduce((n, o) => n + o.totalMinor, 0) }
}

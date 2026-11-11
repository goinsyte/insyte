import { Schema } from "effect"

/*
 * Daily facts (M10.4; domain.md §10, ADR-0017, widgets/02 §0): a day's sums of orders, refunds and deliveries per
 * store, for the figures on Start and later Analyse. Days are `YYYY-MM-DD` in the store's timezone. Amounts are minor
 * units in `currency` (the order's or refund's own); converting to a board currency is the reader's, at each day's
 * `fx_rates` (§0.4).
 */

const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))

/** Inclusive on both ends. */
export const RangeInput = Schema.Struct({
  from: Day,
  to: Day,
  storeId: Schema.optional(Schema.String)
})

/** Orders by the day they were placed (§0.1, §0.2). */
export const OrdersDay = Schema.Struct({
  day: Day,
  storeId: Schema.String,
  currency: Schema.String,
  /** Every order placed that day, drafts aside. */
  orders: Schema.Int,
  /** Of those, paid at some point (refunded or cancelled since included). */
  paidOrders: Schema.Int,
  /** The orders that count toward revenue now (§0.1): not cancelled or refunded, paid or partially refunded. */
  countedOrders: Schema.Int,
  /** Their `total_minor`; a partial refund is not subtracted (§0.1). */
  countedRevenueMinor: Schema.Int,
  /** Items on the counted orders. */
  units: Schema.Int,
  /** `total_minor` of every paid order, whatever happened since. */
  revenueMinor: Schema.Int,
  /** Orders placed that day with a refund since, and what was refunded on them (the order-stage view). */
  refunds: Schema.Int,
  refundedMinor: Schema.Int,
  cancelled: Schema.Int
})
export type OrdersDay = typeof OrdersDay.Type

/** Refunds by the day they were made (§0.1: every money figure about refunds). */
export const RefundsDay = Schema.Struct({
  day: Day,
  storeId: Schema.String,
  currency: Schema.String,
  refunds: Schema.Int,
  amountMinor: Schema.Int
})
export type RefundsDay = typeof RefundsDay.Type

/** Orders by the day their last parcel arrived (§0.3, B.0.4); cancelled orders and those still on the way are not. */
export const DeliveriesDay = Schema.Struct({
  day: Day,
  storeId: Schema.String,
  parcels: Schema.Int,
  onTime: Schema.Int,
  late: Schema.Int,
  daysLateSum: Schema.Int,
  tookDaysSum: Schema.Int
})
export type DeliveriesDay = typeof DeliveriesDay.Type

export class FactsRange extends Schema.Class<FactsRange>("facts/FactsRange")({
  orders: Schema.Array(OrdersDay),
  refunds: Schema.Array(RefundsDay),
  deliveries: Schema.Array(DeliveriesDay)
}) {}

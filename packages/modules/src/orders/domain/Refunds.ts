import { Schema } from "effect"
import { OrderRow } from "./Orders.ts"

/*
 * Refunds (M7.2; 04 §7, api.md §1.1): money that leaves is irreversible, so the console confirms first and there is no
 * undo token. The refund id is minted by the caller, so a request sent twice refunds once, and it is Shopify's
 * idempotency key too (`refundCreate @idempotent`).
 */

export const RefundId = Schema.String.check(
  Schema.isPattern(/^rfd_[0-9a-hjkmnp-tv-z]{26}$/, { message: "Ongeldige id" })
)

export const RefundInput = Schema.Struct({
  id: Schema.String,
  refundId: RefundId,
  /** In the order's currency, minor units; at most what is still refundable. */
  amountMinor: Schema.Int.check(Schema.isGreaterThan(0)),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(500)))
})

export class RefundResult extends Schema.Class<RefundResult>("orders/RefundResult")({
  refundId: Schema.String,
  order: OrderRow
}) {}

/**
 * Over what the role may refund per order: the limit in the order's currency, minor units, and the role's own in the
 * workspace's currency it was converted from.
 */
export class RefundOverLimit extends Schema.TaggedError<RefundOverLimit>()("RefundOverLimit", {
  limitMinor: Schema.Int,
  currency: Schema.String,
  roleMinor: Schema.Int,
  roleCurrency: Schema.String
}) {}

/** More than is left on the order: what is left, in the order's currency. */
export class RefundOverBalance extends Schema.TaggedError<RefundOverBalance>()("RefundOverBalance", {
  balanceMinor: Schema.Int,
  /** Optional, so a console deployed before the API it calls still decodes the refusal. */
  currency: Schema.optional(Schema.String)
}) {}

/** Nothing left to refund: refunded in full, or never paid. */
export class AlreadyRefunded extends Schema.TaggedError<AlreadyRefunded>()("AlreadyRefunded", {
  orderId: Schema.String
}) {}

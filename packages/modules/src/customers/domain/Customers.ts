import { Schema } from "effect"
import { FulfillmentStatus, PaymentStatus } from "../../orders/domain/Orders.ts"

/*
 * Klanten (M6.4; domain.md §4.2): the mirror's customers, their order count and value as Shopify keeps them, with the
 * profiles merged into them counted in (M7.4). The commands are `Commands.ts`.
 */

export class CustomerRow extends Schema.Class<CustomerRow>("customers/CustomerRow")({
  id: Schema.String,
  storeId: Schema.String,
  shopifyId: Schema.String,
  name: Schema.String,
  email: Schema.NullOr(Schema.String),
  phone: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  ordersCount: Schema.Int,
  lifetimeValueMinor: Schema.Int,
  currency: Schema.String,
  /** The newest order Insyte holds for them. */
  lastOrderAt: Schema.NullOr(Schema.Finite),
  updatedAt: Schema.Finite
}) {}

export const CustomerOrder = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  status: Schema.String,
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  totalMinor: Schema.Int,
  currency: Schema.String,
  placedAt: Schema.Finite
})

export class CustomerDetail extends Schema.Class<CustomerDetail>("customers/CustomerDetail")({
  customer: CustomerRow,
  address: Schema.NullOr(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  marketingConsent: Schema.Boolean,
  orders: Schema.Array(CustomerOrder),
  /** Merged into another profile, or others merged into this one (M7.4). */
  merged: Schema.Struct({
    into: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
    absorbed: Schema.Int,
    alsoEmails: Schema.Array(Schema.String)
  }),
  /** The Klaviyo list they were last sent to, and when (M7.5). */
  klaviyo: Schema.NullOr(Schema.Struct({ list: Schema.String, at: Schema.Finite }))
}) {}

/**
 * A customer is new up to this many orders (their merged profiles' counted in), and returning ("VIP") after: the
 * list's status and the panel's count read the same line.
 */
export const NEW_UP_TO_ORDERS = 2

/** The panel's segments (ADR-0028): new and returning customers, by the list's own line. */
export const CustomerCounts = Schema.Struct({ new: Schema.Int, returning: Schema.Int })
export type CustomerCounts = typeof CustomerCounts.Type

export class CustomerPage extends Schema.Class<CustomerPage>("customers/CustomerPage")({
  rows: Schema.Array(CustomerRow),
  nextCursor: Schema.NullOr(Schema.String),
  counts: Schema.Struct({ total: Schema.Int })
}) {}

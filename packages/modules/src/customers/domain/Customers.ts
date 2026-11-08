import { Schema } from "effect"

/* Klanten, read-only (M6.4; domain.md §4.2): the mirror's customers, their order count and value as Shopify keeps them. */

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
  totalMinor: Schema.Int,
  currency: Schema.String,
  placedAt: Schema.Finite
})

export class CustomerDetail extends Schema.Class<CustomerDetail>("customers/CustomerDetail")({
  customer: CustomerRow,
  address: Schema.NullOr(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  marketingConsent: Schema.Boolean,
  orders: Schema.Array(CustomerOrder)
}) {}

export class CustomerPage extends Schema.Class<CustomerPage>("customers/CustomerPage")({
  rows: Schema.Array(CustomerRow),
  nextCursor: Schema.NullOr(Schema.String),
  counts: Schema.Struct({ total: Schema.Int })
}) {}

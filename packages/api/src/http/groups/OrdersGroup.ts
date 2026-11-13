import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, RefundOverLimitV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"
import { Money, Order } from "./CommerceGroup.ts"

/* One order (M7, M8.4): its lines and parcels, and the order commands, each once per `Idempotency-Key`. */

const Address = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  line1: Schema.NullOr(Schema.String),
  line2: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  postcode: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  phone: Schema.NullOr(Schema.String)
})

export const Refund = Schema.Struct({
  id: Schema.String,
  order_id: Schema.String,
  amount: Money,
  /** `pending` until Shopify took it; `failed` when it never got there. */
  status: Schema.Literals(["pending", "succeeded", "failed"]),
  note: Schema.NullOr(Schema.String),
  created_at: Schema.String
}).annotate({ identifier: "Refund" })

/** One order with its lines, its address, the team's internal note and its refunds. */
export const OrderDetailV1 = Schema.Struct({
  ...Order.fields,
  lines: Schema.Array(Schema.Struct({
    title: Schema.String,
    variant_title: Schema.NullOr(Schema.String),
    sku: Schema.NullOr(Schema.String),
    quantity: Schema.Int,
    unit_price_minor: Schema.Int
  })),
  shipping_address: Schema.NullOr(Address),
  internal_note: Schema.NullOr(Schema.String),
  refunds: Schema.Array(Refund)
}).annotate({ identifier: "OrderDetail" })

/** An order's parcels (M8.4): Shopify's and AfterShip's word together. */
export const TrackingV1 = Schema.Struct({
  order_id: Schema.String,
  delayed_at: Schema.NullOr(Schema.String),
  delivered_at: Schema.NullOr(Schema.String),
  parcels: Schema.Array(Schema.Struct({
    carrier: Schema.NullOr(Schema.String),
    tracking_number: Schema.NullOr(Schema.String),
    tracking_url: Schema.NullOr(Schema.String),
    shipped_at: Schema.NullOr(Schema.String),
    status: Schema.NullOr(Schema.String).annotate({
      description: "pending, in_transit, out_for_delivery, delivered, exception, expired or returned."
    }),
    checkpoint: Schema.NullOr(Schema.String),
    exception: Schema.NullOr(Schema.String),
    estimated_delivery: Schema.NullOr(Schema.String),
    delivered_at: Schema.NullOr(Schema.String)
  }))
}).annotate({ identifier: "Tracking" })

export class OrdersGroup extends HttpApiGroup.make("orders")
  .add(
    HttpApiEndpoint.get("tracking", "/orders/:id/tracking", {
      params: ById,
      success: TrackingV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "Where an order's parcels are: carrier, tracking number, status, the latest checkpoint, an exception, and when it was delivered; whether the order is delayed. Needs `orders.read`."
    ),
    HttpApiEndpoint.get("order", "/orders/:id", {
      params: ById,
      success: OrderDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One order with its lines, address, internal note and refunds. Needs `orders.read`."
    ),
    HttpApiEndpoint.post("tags", "/orders/:id/tags", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        add: Schema.optional(Schema.Array(Schema.String)),
        remove: Schema.optional(Schema.Array(Schema.String))
      }),
      success: Order,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Adds and removes the order's tags; Shopify hears it a few seconds later. Insyte's own markers (`at_risk`, `tracking_sent`, `draft`) are refused. Needs `orders.write`."
    ),
    HttpApiEndpoint.post("note", "/orders/:id/note", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ body: Schema.String }),
      success: OrderDetailV1,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "The team's internal note on the order; empty clears it. Never sent to Shopify or a supplier. Needs `orders.write`."
    ),
    HttpApiEndpoint.patch("shippingAddress", "/orders/:id/shipping_address", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        line1: Schema.String,
        line2: Schema.optional(Schema.NullOr(Schema.String)),
        city: Schema.String,
        postcode: Schema.String,
        region: Schema.optional(Schema.String),
        country: Schema.String
      }),
      success: Order,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "The order's shipping address (the name and phone stay); Shopify hears it a few seconds later. `country` is ISO 3166 alpha-2. Needs `orders.write`."
    ),
    HttpApiEndpoint.post("cancel", "/orders/:id/cancel", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ restock: Schema.Boolean, notify_customer: Schema.Boolean }),
      success: Order,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Cancels the order in Insyte and Shopify, without a refund. Irreversible: send an `Idempotency-Key`. Refused for an order already closed or with parcels on their way. Needs `orders.write`."
    ),
    HttpApiEndpoint.post("refund", "/orders/:id/refunds", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ amount_minor: Schema.Int, note: Schema.optional(Schema.String) }),
      success: Refund,
      error: [...WriteErrors, RefundOverLimitV1]
    }).annotate(
      OpenApi.Description,
      "Refunds part or all of what is left on the order, through its original payments. Irreversible: send an `Idempotency-Key`, which also makes Shopify refund once. Needs `orders.write` and `refunds.write`, within the key's limit; `pending` until Shopify took it."
    )
  )
  .annotate(OpenApi.Title, "Orders")
{}

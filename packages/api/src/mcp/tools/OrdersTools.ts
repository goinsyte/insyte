import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import {
  ActionNotAllowedV1,
  ConflictV1,
  IdempotencyKeyReusedV1,
  NotFoundV1,
  RefundOverLimitV1,
  ScopeMissingV1,
  ValidationFailedV1
} from "../../http/Errors.ts"
import { Order } from "../../http/groups/CommerceGroup.ts"
import { OrderDetailV1, Refund, TrackingV1 } from "../../http/groups/OrdersGroup.ts"
import { asKey, Governed, IdempotencyKey, OrderId, WriteFailure } from "../Shared.ts"

/* One order (M19.3): read with its parcels, and the order commands (M7) as `/v1` has them. */

export const GetOrder = Tool.make("get_order", {
  description:
    "One order with its lines, shipping address, the team's internal note and its refunds. Needs orders.read.",
  parameters: Schema.Struct({ order_id: OrderId }),
  success: OrderDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const TagOrder = Tool.make("tag_order", {
  description:
    "Adds and removes the order's tags; Shopify hears it a few seconds later. Insyte's own markers (at_risk, tracking_sent, draft) cannot be set. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    add: Schema.optional(Schema.Array(Schema.String)),
    remove: Schema.optional(Schema.Array(Schema.String)),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Order),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SetOrderNote = Tool.make("set_order_note", {
  description:
    "Sets the team's internal note on the order; an empty body clears it. Never sent to Shopify or a supplier. Needs orders.write.",
  parameters: Schema.Struct({ order_id: OrderId, body: Schema.String, idempotency_key: IdempotencyKey }),
  success: Governed(OrderDetailV1),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const UpdateShippingAddress = Tool.make("update_shipping_address", {
  description:
    "Changes the order's shipping address (the name and phone stay); Shopify hears it a few seconds later. country is ISO 3166 alpha-2. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    line1: Schema.String,
    line2: Schema.optional(Schema.NullOr(Schema.String)),
    city: Schema.String,
    postcode: Schema.String,
    region: Schema.optional(Schema.String),
    country: Schema.String,
    idempotency_key: IdempotencyKey
  }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const FlagOrderDelayed = Tool.make("flag_order_delayed", {
  description:
    "Marks the order delayed (Insyte's at_risk marker); automations and webhooks hear order.delayed a few seconds later. The shopper is not mailed. Refused for an order closed or delivered. Needs orders.write.",
  parameters: Schema.Struct({ order_id: OrderId, idempotency_key: IdempotencyKey }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ClearOrderDelay = Tool.make("clear_order_delay", {
  description:
    "Takes the delay off the order; Insyte raises it again only when something new happens (the parcel stops again, the supplier misses a later hand-off). Needs orders.write.",
  parameters: Schema.Struct({ order_id: OrderId, idempotency_key: IdempotencyKey }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const CancelOrder = Tool.make("cancel_order", {
  description:
    "Cancels the order in Insyte and Shopify, without a refund. IRREVERSIBLE: confirm with the person first, and pass an idempotency_key. Refused for an order already closed or with parcels on their way. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    restock: Schema.Boolean,
    notify_customer: Schema.Boolean,
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Order),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const RefundOrder = Tool.make("refund_order", {
  description:
    "Refunds part or all of what is left on the order, through its original payments. IRREVERSIBLE: money leaves; confirm the amount with the person first, and pass an idempotency_key. Needs orders.write and refunds.write, within the key's limit.",
  parameters: Schema.Struct({
    order_id: OrderId,
    amount_minor: Schema.Int.annotate({ description: "In the order's currency, minor units (cents)." }),
    note: Schema.optional(Schema.String),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Refund),
  failure: Schema.Union([
    ActionNotAllowedV1,
    ScopeMissingV1,
    NotFoundV1,
    ConflictV1,
    ValidationFailedV1,
    IdempotencyKeyReusedV1,
    RefundOverLimitV1
  ]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const GetOrderTracking = Tool.make("get_order_tracking", {
  description:
    "Where an order's parcels are: carrier, tracking number, status (pending, in_transit, out_for_delivery, delivered, exception), the latest checkpoint and any exception; whether the order is delayed. Needs orders.read.",
  parameters: Schema.Struct({ order_id: OrderId }),
  success: TrackingV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const OrdersTools = Toolkit.make(
  GetOrder,
  TagOrder,
  SetOrderNote,
  UpdateShippingAddress,
  FlagOrderDelayed,
  ClearOrderDelay,
  CancelOrder,
  RefundOrder,
  GetOrderTracking
)

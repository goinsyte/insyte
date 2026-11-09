import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import {
  ConflictV1,
  CurrentApiKey,
  CustomerPageV1,
  ForwardView,
  IdempotencyKeyReusedV1,
  InvalidRequestV1,
  Leg,
  LegPageV1,
  Me,
  Member,
  NotFoundV1,
  Order,
  OrderDetailV1,
  OrderPageV1,
  ProductPageV1,
  Refund,
  RefundOverLimitV1,
  Role,
  ScopeMissingV1,
  Supplier,
  TrackingV1,
  ValidationFailedV1
} from "../http/PublicApi.ts"

/*
 * The MCP server's tools (M19.3): what an agent with an API key may read, in the public API's shapes, and the order
 * commands (M7) and forwarding (M8) as `/v1` has them. The same key, the same scopes, the same request log; inviting, removing and
 * changing roles stay with people.
 */

/** What the key door provides: every tool runs as the key. */
const asKey = () => [CurrentPrincipal, CurrentApiKey, Db]

export const Whoami = Tool.make("whoami", {
  description: "The API key in use: its label, its scopes and the Insyte workspace it belongs to.",
  success: Me,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListMembers = Tool.make("list_members", {
  description: "The workspace's team members: name, email, role and whether they are active. Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Member) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListRoles = Tool.make("list_roles", {
  description: "The workspace's roles and what each may do per area (none, read, write, manage). Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Role) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

/** What every list tool takes: the `/v1` list's query, typed. */
const ListParameters = Schema.Struct({
  limit: Schema.optional(Schema.Int).annotate({ description: "Rows per page, 1 to 200; 50 by default." }),
  cursor: Schema.optional(Schema.String).annotate({ description: "The next_cursor of the previous page." }),
  q: Schema.optional(Schema.String).annotate({ description: "Search text." }),
  store_id: Schema.optional(Schema.String).annotate({ description: "One store only." }),
  status: Schema.optional(Schema.String).annotate({ description: "One status only." })
})

export const ListOrders = Tool.make("list_orders", {
  description:
    "The workspace's orders as Shopify holds them, newest first: number, customer, status, payment, fulfilment, total, tracking. `q` searches the number and the customer. Needs orders.read.",
  parameters: ListParameters,
  success: OrderPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListProducts = Tool.make("list_products", {
  description: "The workspace's products by title: status, vendor, price range and stock. Needs products.read.",
  parameters: ListParameters,
  success: ProductPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListCustomers = Tool.make("list_customers", {
  description:
    "The workspace's customers by name: email, country, order count and lifetime value. Needs customers.read.",
  parameters: ListParameters,
  success: CustomerPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

const OrderId = Schema.String.annotate({ description: "The order's id (ord_…), as list_orders gives it." })
const IdempotencyKey = Schema.optional(Schema.String).annotate({
  description: "Your own key for doing this once: the same key again answers the first result instead of acting twice."
})
const WriteFailure = Schema.Union([ScopeMissingV1, NotFoundV1, ConflictV1, ValidationFailedV1, IdempotencyKeyReusedV1])

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
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SetOrderNote = Tool.make("set_order_note", {
  description:
    "Sets the team's internal note on the order; an empty body clears it. Never sent to Shopify or a supplier. Needs orders.write.",
  parameters: Schema.Struct({ order_id: OrderId, body: Schema.String, idempotency_key: IdempotencyKey }),
  success: OrderDetailV1,
  failure: WriteFailure,
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

export const CancelOrder = Tool.make("cancel_order", {
  description:
    "Cancels the order in Insyte and Shopify, without a refund. IRREVERSIBLE: confirm with the person first, and pass an idempotency_key. Refused for an order already closed or with parcels on their way. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    restock: Schema.Boolean,
    notify_customer: Schema.Boolean,
    idempotency_key: IdempotencyKey
  }),
  success: Order,
  failure: WriteFailure,
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
  success: Refund,
  failure: Schema.Union([
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

export const ListSuppliers = Tool.make("list_suppliers", {
  description:
    "The workspace's suppliers: whether each is paused, how it takes its orders (portal, email or api), and its open and delayed orders. Use it to pick a supplier for reroute_leg. Needs suppliers.read.",
  success: Schema.Struct({ data: Schema.Array(Supplier) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListForwarding = Tool.make("list_forwarding", {
  description:
    "The forwarding queue: each leg is one paid order's lines for one supplier. view to_forward (waiting to be sent), awaiting (sent, waiting for the supplier) or forward_error (failed, with the reason); without a view, every open leg. Needs orders.read.",
  parameters: Schema.Struct({ view: Schema.optional(ForwardView) }),
  success: LegPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ForwardOrders = Tool.make("forward_orders", {
  description:
    "Sends legs to their suppliers: after a few seconds the supplier receives its own lines and the shipping address (never the customer's email or phone) by its API or mail, and that cannot be called back. Confirm the orders and suppliers with the person first, and pass an idempotency_key. Legs without a supplier or with a paused one are refused. Needs orders.write.",
  parameters: Schema.Struct({
    leg_ids: Schema.Array(Schema.String),
    note: Schema.optional(Schema.String).annotate({ description: "A note for the suppliers." }),
    idempotency_key: IdempotencyKey
  }),
  success: Schema.Struct({ data: Schema.Array(Leg) }),
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const RerouteLeg = Tool.make("reroute_leg", {
  description:
    "Moves a leg not yet sent (to forward, or failed) to another supplier that is not paused; it then waits to be forwarded there. Find suppliers with list_suppliers. Needs orders.write.",
  parameters: Schema.Struct({ leg_id: Schema.String, supplier_id: Schema.String, idempotency_key: IdempotencyKey }),
  success: Leg,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const InsyteTools = Toolkit.make(
  Whoami,
  ListMembers,
  ListRoles,
  ListOrders,
  ListProducts,
  ListCustomers,
  GetOrder,
  TagOrder,
  SetOrderNote,
  UpdateShippingAddress,
  CancelOrder,
  RefundOrder,
  GetOrderTracking,
  ListSuppliers,
  ListForwarding,
  ForwardOrders,
  RerouteLeg
)

import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import {
  LIVE_WEBHOOK_EVENTS,
  WEBHOOK_AUTO_DISABLE_AFTER,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
} from "@insyte/domain/Webhooks"
import { Context, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi
} from "effect/http-api"

/*
 * The public API (M19.2, api.md §6): REST under `/v1`, a bearer API key, JSON in snake_case English. What a key may do
 * is its access as the catalogue allows it through the API; it reads: the key itself, the team and the roles, and the
 * orders, products and customers (M6.4); and it acts on orders (M7: tags, the internal note, the shipping address,
 * cancelling, refunds within the key's limit), each write taking an `Idempotency-Key`. Its OpenAPI document is
 * generated from this file, and the reference at `/v1/docs` is drawn from that.
 */

/* ── errors ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One envelope for every error (api.md §6): `{ error: { code, message, request_id, … } }`, `code` a frozen `…V1` tag,
 * `request_id` the `Insyte-Request-Id` the response carries.
 */
const envelope = <const Code extends string, const Fields extends Schema.Struct.Fields>(
  code: Code,
  status: number,
  fields: Fields
) =>
  Schema.Struct({
    error: Schema.Struct({ code: Schema.Literal(code), message: Schema.String, request_id: Schema.String, ...fields })
  }).pipe(HttpApiSchema.status(status)).annotate({ identifier: code })

/** No key, or one that is malformed, unknown, revoked or expired; `reason` says which. */
export const UnauthorizedV1 = envelope("UnauthorizedV1", 401, { reason: Schema.String })
/** The key is fenced to addresses this call did not come from. */
export const IpNotAllowedV1 = envelope("IpNotAllowedV1", 403, {})
/** The key's access lacks a scope the endpoint needs, as `area.read` or `area.write`. */
export const ScopeMissingV1 = envelope("ScopeMissingV1", 403, { scope: Schema.String })
/** Over the key's rate (120 a minute, 10 a second); `retry_after` in seconds. */
export const RateLimitedV1 = envelope("RateLimitedV1", 429, { retry_after: Schema.Int })

/** A query parameter that cannot be read: an unknown cursor, a page size out of range. */
export const InvalidRequestV1 = envelope("InvalidRequestV1", 400, { field: Schema.String })

/** No such record in the key's stores. */
export const NotFoundV1 = envelope("NotFoundV1", 404, {})
/** The record is not in a state that allows this (an order already cancelled, a refund already made); `reason` says. */
export const ConflictV1 = envelope("ConflictV1", 409, { reason: Schema.String })
/** The body is not what the endpoint takes; `fields` names each field and why. */
export const ValidationFailedV1 = envelope("ValidationFailedV1", 400, {
  fields: Schema.Record(Schema.String, Schema.String)
})
/** More than the key may refund on one order; `limit_minor` is its limit. */
export const RefundOverLimitV1 = envelope("RefundOverLimitV1", 422, { limit_minor: Schema.Int })
/**
 * An agent's call the workspace's autonomy rules do not allow (M15 step 6, ADR-0027): the action is set to Nooit, or
 * is outside the catalogue; `reason` says which (`policy`, `unknown`). Nothing happened.
 */
export const ActionNotAllowedV1 = envelope("ActionNotAllowedV1", 403, { action: Schema.String, reason: Schema.String })
/** The `Idempotency-Key` was first used for a different request. */
export const IdempotencyKeyReusedV1 = envelope("IdempotencyKeyReusedV1", 422, {})

export type ScopeMissingV1 = typeof ScopeMissingV1.Type
export type NotFoundV1 = typeof NotFoundV1.Type
export type ConflictV1 = typeof ConflictV1.Type
export type ValidationFailedV1 = typeof ValidationFailedV1.Type
export type RefundOverLimitV1 = typeof RefundOverLimitV1.Type
export type IdempotencyKeyReusedV1 = typeof IdempotencyKeyReusedV1.Type
export type ActionNotAllowedV1 = typeof ActionNotAllowedV1.Type
export type InvalidRequestV1 = typeof InvalidRequestV1.Type

/* ── what a key is ──────────────────────────────────────────────────────────────────────────────── */

/** The authenticated key, beside its principal: what `/v1/me` answers, and the request's id for its errors. */
export class CurrentApiKey extends Context.Service<CurrentApiKey, {
  readonly id: string
  readonly label: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly requestId: string
}>()("api/CurrentApiKey") {}

/**
 * `Authorization: Bearer ins_live_…` → the key's principal and its request connection. Every endpoint is behind it;
 * every response carries `Insyte-Request-Id`, and each answered call lands in the key's request log.
 */
export class ApiKeyAuth extends HttpApiMiddleware.Service<ApiKeyAuth, {
  provides: CurrentPrincipal | CurrentApiKey | Db
}>()("api/ApiKeyAuth", {
  error: [UnauthorizedV1, IpNotAllowedV1, RateLimitedV1],
  security: { bearer: HttpApiSecurity.bearer }
}) {}

/* ── resources ──────────────────────────────────────────────────────────────────────────────────── */

const Access = Schema.Literals(["none", "read", "write", "manage"])

export const Me = Schema.Struct({
  key: Schema.Struct({ id: Schema.String, label: Schema.String, scopes: Schema.Array(Schema.String) }),
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String })
}).annotate({ identifier: "Me" })

export const Member = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Struct({ id: Schema.String, label: Schema.String }),
  status: Schema.Literals(["active", "deactivated"]),
  joined_at: Schema.String,
  last_active_at: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Member" })

export const Role = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  system: Schema.Boolean,
  /** Area → what the role may do there. */
  access: Schema.Record(Schema.String, Access)
}).annotate({ identifier: "Role" })

const List = <S extends Schema.Top>(item: S) => Schema.Struct({ data: Schema.Array(item) })

const Money = Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String })

export const Order = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  store_id: Schema.String,
  customer: Schema.Struct({
    id: Schema.NullOr(Schema.String),
    name: Schema.String,
    email: Schema.NullOr(Schema.String)
  }),
  status: Schema.String,
  payment_status: Schema.String,
  fulfillment_status: Schema.String,
  total: Money,
  tags: Schema.Array(Schema.String),
  line_count: Schema.Int,
  tracking: Schema.NullOr(Schema.Struct({ carrier: Schema.NullOr(Schema.String), number: Schema.String })),
  placed_at: Schema.String,
  updated_at: Schema.String
}).annotate({ identifier: "Order" })

export const Product = Schema.Struct({
  id: Schema.String,
  store_id: Schema.String,
  title: Schema.String,
  handle: Schema.String,
  status: Schema.String,
  vendor: Schema.NullOr(Schema.String),
  product_type: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  image: Schema.NullOr(Schema.String),
  variant_count: Schema.Int,
  price: Schema.Struct({
    min_minor: Schema.NullOr(Schema.Int),
    max_minor: Schema.NullOr(Schema.Int),
    currency: Schema.String
  }),
  available: Schema.NullOr(Schema.Int),
  updated_at: Schema.String
}).annotate({ identifier: "Product" })

export const Customer = Schema.Struct({
  id: Schema.String,
  store_id: Schema.String,
  name: Schema.String,
  email: Schema.NullOr(Schema.String),
  phone: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  orders_count: Schema.Int,
  lifetime_value: Money,
  last_order_at: Schema.NullOr(Schema.String),
  updated_at: Schema.String
}).annotate({ identifier: "Customer" })

/** A page: the rows, the cursor for the next (`null` at the end), and how many match in all. */
const Page = <S extends Schema.Top>(item: S) =>
  Schema.Struct({ data: Schema.Array(item), next_cursor: Schema.NullOr(Schema.String), total: Schema.Int })

/** What every list reads from its query string. */
export const ListQuery = Schema.Struct({
  limit: Schema.optional(Schema.FiniteFromString),
  cursor: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String),
  store_id: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String)
})
export type ListQuery = typeof ListQuery.Type

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

export const OrderPageV1 = Page(Order)
export const ProductPageV1 = Page(Product)
export const CustomerPageV1 = Page(Customer)

/* ── the API ────────────────────────────────────────────────────────────────────────────────────── */

export class KeyGroup extends HttpApiGroup.make("key")
  .add(
    HttpApiEndpoint.get("me", "/me", { success: Me }).annotate(
      OpenApi.Description,
      "The key making the call: its scopes and the workspace it belongs to."
    )
  )
  .annotate(OpenApi.Title, "Key")
{}

export class TeamGroup extends HttpApiGroup.make("team")
  .add(
    HttpApiEndpoint.get("members", "/members", { success: List(Member), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's members. Needs `team.read`."
    ),
    HttpApiEndpoint.get("roles", "/roles", { success: List(Role), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's roles and what each may do per area. Needs `team.read`."
    )
  )
  .annotate(OpenApi.Title, "Team")
{}

export class CommerceGroup extends HttpApiGroup.make("commerce")
  .add(
    HttpApiEndpoint.get("orders", "/orders", {
      query: ListQuery,
      success: OrderPageV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's orders as Shopify holds them, newest first: `q` searches number and customer, `status` one status, `cursor` the next page. Needs `orders.read`."
    ),
    HttpApiEndpoint.get("products", "/products", {
      query: ListQuery,
      success: ProductPageV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's products by title, with their price range and stock. Needs `products.read`."
    ),
    HttpApiEndpoint.get("customers", "/customers", {
      query: ListQuery,
      success: CustomerPageV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(OpenApi.Description, "The workspace's customers by name. Needs `customers.read`.")
  )
  .annotate(OpenApi.Title, "Commerce")
{}

/** What every write reads from its headers: the caller's key for doing it once. */
/**
 * Every write names an `Idempotency-Key`; a missing one is refused with `InvalidRequestV1` by the handler, so the
 * refusal comes in the V1 envelope rather than as a bare schema error.
 */
const Writes = {
  "idempotency-key": Schema.optional(Schema.String).annotate({
    description: "Required. A value of your own, up to 255 characters; send the same one when you retry."
  })
}
const ById = { id: Schema.String }
const WriteErrors = [
  ScopeMissingV1,
  NotFoundV1,
  ConflictV1,
  ValidationFailedV1,
  IdempotencyKeyReusedV1,
  InvalidRequestV1
]

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

const Party = Schema.Struct({ id: Schema.String, name: Schema.String })

/** A forwarding leg (M8.2): one order's lines for one supplier, and where it stands. */
export const Leg = Schema.Struct({
  id: Schema.String,
  order: Schema.Struct({ id: Schema.String, number: Schema.String }),
  store_id: Schema.String,
  supplier: Schema.NullOr(Party),
  from_supplier: Schema.NullOr(Party),
  lines: Schema.Array(Schema.Struct({
    title: Schema.String,
    variant_title: Schema.NullOr(Schema.String),
    quantity: Schema.Int
  })),
  state: Schema.String.annotate({ description: "to_forward, sending, awaiting, confirmed, error or cancelled." }),
  via: Schema.NullOr(Schema.String).annotate({ description: "portal, email or api." }),
  since: Schema.String,
  confirm_by: Schema.NullOr(Schema.String),
  late: Schema.Boolean,
  error: Schema.NullOr(Schema.Struct({
    kind: Schema.String.annotate({
      description: "stock, address, no_supplier, rejected, send_failed or supplier_paused."
    }),
    note: Schema.NullOr(Schema.String)
  }))
}).annotate({ identifier: "Leg" })

export const LegPageV1 = Schema.Struct({
  data: Schema.Array(Leg),
  counts: Schema.Struct({ to_forward: Schema.Int, awaiting: Schema.Int, late: Schema.Int, error: Schema.Int })
})

export const Supplier = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  paused: Schema.Boolean,
  forward_channel: Schema.String,
  auto_forward: Schema.Boolean,
  contact_email: Schema.NullOr(Schema.String),
  stats: Schema.Struct({ products: Schema.Int, open: Schema.Int, delayed: Schema.Int })
}).annotate({ identifier: "Supplier" })

/** A supplier's statement for one month (M13 step 6): what the brand owes it, in the workspace's currency. */
export const SupplierStatement = Schema.Struct({
  id: Schema.NullOr(Schema.String).annotate({ description: "Null for the running month, which is not closed yet." }),
  month: Schema.String.annotate({ description: "YYYY-MM." }),
  status: Schema.String.annotate({ description: "open (running month), processing (closed, to be paid) or paid." }),
  currency: Schema.String,
  shipped_minor: Schema.Int,
  corrections_minor: Schema.Int.annotate({ description: "Supplier-fault returns refunded; zero or negative." }),
  total_minor: Schema.Int,
  shipped_lines: Schema.Int,
  missing_lines: Schema.Int.annotate({ description: "Lines that count nothing: no cost price or no exchange rate." }),
  pay_day: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  paid_at: Schema.NullOr(Schema.String),
  paid_reference: Schema.NullOr(Schema.String)
}).annotate({ identifier: "SupplierStatement" })

export const SupplierStatementsV1 = Schema.Struct({
  supplier: Party,
  data: Schema.Array(SupplierStatement),
  summary: Schema.Struct({ currency: Schema.String, paid_ytd_minor: Schema.Int, pay_day: Schema.Int })
})

export const ForwardView = Schema.Literals(["to_forward", "awaiting", "forward_error"])

export class ForwardingGroup extends HttpApiGroup.make("forwarding")
  .add(
    HttpApiEndpoint.get("suppliers", "/suppliers", {
      success: Schema.Struct({ data: Schema.Array(Supplier) }),
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's suppliers and how each takes its orders. Needs `suppliers.read`."
    ),
    HttpApiEndpoint.get("statements", "/suppliers/:id/statements", {
      params: ById,
      success: SupplierStatementsV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "A supplier's monthly statements, newest first: the lines it shipped at their cost price less its returns refunded, and whether each is paid; the running month first while it has lines. Needs `suppliers.read`."
    ),
    HttpApiEndpoint.get("legs", "/forwarding", {
      query: Schema.Struct({ view: Schema.optional(ForwardView) }),
      success: LegPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The forwarding queue: every open leg, or one view of it (`to_forward`, `awaiting`, `forward_error`), oldest first, with the counts. Needs `orders.read`."
    ),
    HttpApiEndpoint.post("forward", "/forwarding/forward", {
      headers: Writes,
      payload: Schema.Struct({
        leg_ids: Schema.Array(Schema.String),
        note: Schema.optional(Schema.String).annotate({ description: "For the suppliers; never the internal note." }),
        via: Schema.optional(Schema.Record(Schema.String, Schema.Literals(["portal", "email", "api"]))).annotate({
          description: "How a supplier gets them, by supplier id, where it should differ from its own setting."
        })
      }),
      success: Schema.Struct({ data: Schema.Array(Leg) }),
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Forwards legs to their suppliers. They wait a few seconds, then go by the supplier's API or mail; a supplier gets only its own lines and the address, never the customer's email or phone. Legs without a supplier or with a paused one are refused (`409`). Needs `orders.write`."
    ),
    HttpApiEndpoint.post("reroute", "/forwarding/:id/reroute", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ supplier_id: Schema.String }),
      success: Leg,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Moves a leg not yet sent to another supplier that is not paused; it is to be forwarded again, there. Needs `orders.write`."
    )
  )
  .annotate(OpenApi.Title, "Forwarding")
{}

/** A return or claim (M9.1): what goes back, why, what the shopper asked for, and where it stands. */
export const Return = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  kind: Schema.String.annotate({
    description: "return (something comes back) or claim (a problem, maybe nothing comes back)."
  }),
  order: Schema.Struct({ id: Schema.String, number: Schema.String }),
  store_id: Schema.String,
  customer: Schema.Struct({
    id: Schema.NullOr(Schema.String),
    name: Schema.String,
    email: Schema.NullOr(Schema.String)
  }),
  status: Schema.String.annotate({
    description: "review, awaiting_parcel, in_transit, received, ready, resolved or rejected."
  }),
  reason: Schema.Struct({ id: Schema.String, label: Schema.String }),
  note: Schema.String.annotate({ description: "The shopper's own words." }),
  requested_resolution: Schema.String.annotate({
    description: "refund, exchange, gift_card, replacement or discount."
  }),
  units: Schema.Int,
  amount: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String }),
  review_by: Schema.String,
  late: Schema.Boolean,
  resolution: Schema.NullOr(Schema.Struct({
    kind: Schema.String,
    amount_minor: Schema.Int,
    resolved_at: Schema.String
  })),
  rejected_reason: Schema.NullOr(Schema.String),
  label: Schema.NullOr(Schema.Struct({
    state: Schema.String.annotate({
      description: "requested (made at the carrier in a few seconds), issued, or failed (with the carrier's reason)."
    }),
    carrier: Schema.NullOr(Schema.String),
    tracking: Schema.NullOr(Schema.String),
    tracking_url: Schema.NullOr(Schema.String),
    reason: Schema.NullOr(Schema.String)
  })).annotate({ description: "The return label, once asked for." }),
  created_at: Schema.String
}).annotate({ identifier: "Return" })

export const ReturnPageV1 = Schema.Struct({
  data: Schema.Array(Return),
  counts: Schema.Struct({
    total: Schema.Int,
    review: Schema.Int,
    late: Schema.Int,
    awaiting: Schema.Int,
    ready: Schema.Int
  })
})

export const ReturnDetailV1 = Schema.Struct({
  ...Return.fields,
  lines: Schema.Array(Schema.Struct({
    id: Schema.String,
    order_line_id: Schema.String,
    title: Schema.String,
    variant_title: Schema.String,
    quantity: Schema.Int,
    condition: Schema.NullOr(Schema.String)
  })),
  window: Schema.Struct({ inside: Schema.Boolean, days: Schema.Int, closes_on: Schema.String }),
  allowed_resolutions: Schema.Array(Schema.Struct({ kind: Schema.String, amount_minor: Schema.Int }))
}).annotate({ identifier: "ReturnDetail" })

export const ReturnStatusFilter = Schema.Literals([
  "review",
  "awaiting_parcel",
  "in_transit",
  "received",
  "ready",
  "resolved",
  "rejected"
])

export class ReturnsGroup extends HttpApiGroup.make("returns")
  .add(
    HttpApiEndpoint.get("returns", "/returns", {
      query: Schema.Struct({ status: Schema.optional(ReturnStatusFilter) }),
      success: ReturnPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Returns and claims, newest first, up to 500, or those in one status; with the queue's counts. Needs `returns.read`."
    ),
    HttpApiEndpoint.get("return", "/returns/:id", {
      params: ById,
      success: ReturnDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One return with its lines, its window and the resolutions it allows with what each moves. Needs `returns.read`."
    ),
    HttpApiEndpoint.post("start", "/returns", {
      headers: Writes,
      payload: Schema.Struct({
        order_id: Schema.String,
        lines: Schema.Array(Schema.Struct({ line_id: Schema.String, quantity: Schema.Int })),
        reason_id: Schema.String.annotate({ description: "One of the workspace's reasons: too_small, damaged, …" }),
        requested_resolution: Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"]),
        note: Schema.optional(Schema.String),
        exchange_to: Schema.optional(Schema.String)
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Starts a return for a shopper; it waits for review. A claim reason makes it a claim. Lines already in a return, or whose product rule allows no return, are refused (`422`). Needs `returns.write`."
    ),
    HttpApiEndpoint.post("approve", "/returns/:id/approve", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        keep_item: Schema.optional(Schema.Boolean).annotate({
          description: "A claim settled without sending anything back."
        })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Approves a return in review. Needs `returns.write` and `returns.approve`."),
    HttpApiEndpoint.post("reject", "/returns/:id/reject", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ reason: Schema.String.annotate({ description: "What the shopper reads." }) }),
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Rejects a return, with the reason. Needs `returns.write` and `returns.approve`."),
    HttpApiEndpoint.post("label", "/returns/:id/label", {
      params: ById,
      headers: Writes,
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Asks for a return label from the carrier the return address names; it is made a few seconds later (`label.state`). Refused (`409`) where no carrier is set up (`labels_unavailable`) or a label cannot be made (`no_return_address`, `no_shopper_address`). Needs `returns.write`."
    ),
    HttpApiEndpoint.post("tracking", "/returns/:id/tracking", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        carrier: Schema.Literals(["PostNL", "DHL", "DPD", "UPS"]),
        tracking: Schema.String.annotate({ description: "The tracking number the shopper sent the parcel with." })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "The shopper sent the parcel themselves (\"zelf versturen\"): its carrier and tracking number, followed like a label's. Needs `returns.write`."
    ),
    HttpApiEndpoint.post("receive", "/returns/:id/receive", {
      params: ById,
      headers: Writes,
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Marks the parcel received. Needs `returns.write`."),
    HttpApiEndpoint.post("inspect", "/returns/:id/inspect", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        lines: Schema.optional(Schema.Array(Schema.Struct({
          line_id: Schema.String,
          condition: Schema.Literals(["ok", "damaged", "missing"]),
          restock: Schema.Boolean
        }))).annotate({ description: "Per line; without, every line is in order and goes back on the shelf." })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Records the inspection; the return is then ready to settle. Needs `returns.write`."
    ),
    HttpApiEndpoint.post("resolve", "/returns/:id/resolve", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        resolution: Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"]),
        exchange_to: Schema.optional(Schema.String)
      }),
      success: Return,
      error: [...WriteErrors, RefundOverLimitV1]
    }).annotate(
      OpenApi.Description,
      "Settles a return that is ready, with a resolution it allows, at the amount the rules give. A refund goes back through the order's payments and is irreversible: send an `Idempotency-Key`, which also makes Shopify refund once. Needs `returns.write`, and `refunds.write` within the key's limit for a refund."
    )
  )
  .annotate(OpenApi.Title, "Returns")
{}

/** A ticket (M11 step 3): the board's work, numbered `#n`, with who has it and what it is about. */
export const Ticket = Schema.Struct({
  id: Schema.String,
  number: Schema.Int.annotate({ description: "The ticket's number, shown as #12." }),
  title: Schema.String,
  description: Schema.String,
  status: Schema.String.annotate({ description: "intake, in_progress, awaiting_reply or done." }),
  priority: Schema.String.annotate({ description: "low, medium or high." }),
  source: Schema.String.annotate({
    description: "Where it came from: manual (written by a person or a key), or gmail, outlook, shopify, … later."
  }),
  labels: Schema.Array(Schema.String),
  assignees: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  related: Schema.NullOr(Schema.Struct({ type: Schema.String, id: Schema.String, label: Schema.String })).annotate({
    description: "The order or customer it is about."
  }),
  topic: Schema.NullOr(Schema.String).annotate({
    description: "where_is_my_order, returns, sizing, payment or product_question, from its words."
  }),
  due_at: Schema.NullOr(Schema.String),
  resolved_at: Schema.NullOr(Schema.String),
  snoozed_until: Schema.NullOr(Schema.String),
  archived_at: Schema.NullOr(Schema.String),
  spam_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
  comment_count: Schema.Int,
  created_at: Schema.String,
  updated_at: Schema.String
}).annotate({ identifier: "Ticket" })

export const TicketComment = Schema.Struct({
  id: Schema.String,
  author: Schema.Struct({ kind: Schema.String, id: Schema.String, name: Schema.String }),
  body: Schema.String,
  mentions: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  created_at: Schema.String
}).annotate({ identifier: "TicketComment" })

export const TicketPageV1 = Schema.Struct({
  data: Schema.Array(Ticket),
  counts: Schema.Struct({
    all: Schema.Int,
    open: Schema.Int,
    unassigned: Schema.Int,
    snoozed: Schema.Int,
    done: Schema.Int,
    archived: Schema.Int,
    spam: Schema.Int,
    trash: Schema.Int
  })
})

export const TicketDetailV1 = Schema.Struct({
  ...Ticket.fields,
  comments: Schema.Array(TicketComment).annotate({ description: "Newest first." })
}).annotate({ identifier: "TicketDetail" })

export const TicketViewFilter = Schema.Literals([
  "all",
  "open",
  "unassigned",
  "snoozed",
  "done",
  "archived",
  "spam",
  "trash"
])
export const TicketStatusV1 = Schema.Literals(["intake", "in_progress", "awaiting_reply", "done"])
export const TicketPriorityV1 = Schema.Literals(["low", "medium", "high"])

export class TicketsGroup extends HttpApiGroup.make("tickets")
  .add(
    HttpApiEndpoint.get("tickets", "/tickets", {
      query: Schema.Struct({ view: Schema.optional(TicketViewFilter) }),
      success: TicketPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Tickets in the board's order, up to 500: by default every one, or one view (all is the board, open is not done and not set aside); with each view's count. Needs `support.read`."
    ),
    HttpApiEndpoint.get("ticket", "/tickets/:id", {
      params: ById,
      success: TicketDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(OpenApi.Description, "One ticket with its comments. Needs `support.read`."),
    HttpApiEndpoint.post("create", "/tickets", {
      headers: Writes,
      payload: Schema.Struct({
        title: Schema.String,
        description: Schema.optional(Schema.String),
        status: Schema.optional(TicketStatusV1),
        priority: Schema.optional(TicketPriorityV1),
        assignee_ids: Schema.optional(Schema.Array(Schema.String)).annotate({
          description: "Member ids, from /members."
        }),
        labels: Schema.optional(Schema.Array(Schema.String)),
        due_at: Schema.optional(Schema.String).annotate({ description: "ISO 8601." }),
        order_id: Schema.optional(Schema.String),
        customer_id: Schema.optional(Schema.String)
      }),
      success: Ticket,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Writes a ticket by hand, at the top of the board; its assignees hear of it. About one order or one customer at most. Needs `support.write`."
    ),
    HttpApiEndpoint.patch("update", "/tickets/:id", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        title: Schema.optional(Schema.String),
        description: Schema.optional(Schema.String),
        priority: Schema.optional(TicketPriorityV1),
        due_at: Schema.optional(Schema.NullOr(Schema.String)).annotate({ description: "ISO 8601; null clears it." }),
        labels: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "The whole set." })
      }),
      success: Ticket,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Changes a ticket's title, description, priority, deadline or labels. Needs `support.write`."
    ),
    HttpApiEndpoint.post("status", "/tickets/:id/status", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ status: TicketStatusV1 }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Moves a ticket to another column; done records when. Needs `support.write`."),
    HttpApiEndpoint.post("assign", "/tickets/:id/assign", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ member_id: Schema.String }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Puts a teammate on the ticket; they hear of it. Needs `support.write`."),
    HttpApiEndpoint.post("unassign", "/tickets/:id/unassign", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ member_id: Schema.String }),
      success: Ticket,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Takes a teammate off the ticket. Needs `support.write`."),
    HttpApiEndpoint.post("comment", "/tickets/:id/comments", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        body: Schema.String,
        mentions: Schema.optional(Schema.Array(Schema.String)).annotate({
          description: "Member ids the comment names; each hears of it."
        })
      }),
      success: TicketComment,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Adds a comment to the ticket's activity, as the key. Needs `support.write`.")
  )
  .annotate(OpenApi.Title, "Tickets")
{}

export const ProposalV1 = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  state: Schema.Literals([
    "open",
    "filed",
    "executed",
    "execution_failed",
    "discarded",
    "superseded",
    "reverted",
    "expired"
  ]).annotate({
    description:
      "`filed`: what it sends leaves once the undo window has passed. `execution_failed`: it did not go (see `execution_error`); filing it again tries again."
  }),
  subject_type: Schema.String,
  subject_id: Schema.String,
  action: Schema.Struct({
    kind: Schema.Literals([
      "approve_return",
      "approve_quality_check",
      "notify_delayed_order",
      "create_supplier_ticket",
      "cancel_order",
      "refund_order",
      "resolve_return",
      "forward_orders",
      "send_return_label",
      "tag_order",
      "set_order_note",
      "create_ticket",
      "update_ticket",
      "set_ticket_status",
      "assign_ticket",
      "comment_on_ticket"
    ]),
    subject_id: Schema.String
  }).annotate({
    description:
      "What filing runs, as the key's own call would: approving the return or the check, mailing the shopper of a delayed order the words in `after`, or opening a reorder ticket for a sold-out product. A plate an agent asked for (its autonomy is Eerst vragen) carries the tool it called, by that tool's name."
  }),
  revision: Schema.Int,
  heading: Schema.String,
  body: Schema.String,
  dimension: Schema.String.annotate({ description: "How long is left, in words (Dutch)." }),
  before: Schema.String,
  after: Schema.String,
  store: Schema.String,
  confidence: Schema.Finite.annotate({ description: "0–1, computed by the rule from the records." }),
  confidence_basis: Schema.String,
  file_label: Schema.String,
  why: Schema.String,
  evidence: Schema.Array(Schema.Struct({ kind: Schema.String, ref: Schema.String, summary: Schema.String })),
  filed_at: Schema.NullOr(Schema.String),
  executed_at: Schema.NullOr(Schema.String),
  execution_error: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Proposal" })

export const QueueItemV1 = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals([
    "order_delayed",
    "return_review",
    "quality_review",
    "stock_out",
    "store_disconnected",
    "chargeback_deadline"
  ]),
  subject_type: Schema.String,
  subject_id: Schema.String,
  store: Schema.NullOr(Schema.String),
  signal: Schema.Literals(["red", "amber", "green", "idle"]),
  title: Schema.String,
  value_minor: Schema.NullOr(Schema.Int),
  currency: Schema.NullOr(Schema.String),
  due_at: Schema.NullOr(Schema.String),
  state: Schema.Literals(["open", "seen", "resolved"]),
  proposal: Schema.NullOr(ProposalV1).annotate({
    description: "The plate Insyte drew for the row, while it is open; file it with `POST /proposals/{id}/file`."
  })
}).annotate({ identifier: "QueueItem" })

export const QueuePageV1 = Schema.Struct({
  data: Schema.Array(QueueItemV1),
  counts: Schema.Struct({ needs_you: Schema.Int, drawn: Schema.Int, all: Schema.Int })
}).annotate({ identifier: "QueuePage" })

export const QueueTabV1 = Schema.Literals(["needs_you", "drawn", "all"])

const AnalyticsMonthV1 = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).annotate({
  description: "A calendar month, YYYY-MM."
})

const AnalyticsSpanV1 = Schema.Struct({
  month: Schema.String,
  from: Schema.String.annotate({ description: "The first day read, YYYY-MM-DD." }),
  to: Schema.String.annotate({ description: "The last day read: both months are cut to the shorter one's days." }),
  days: Schema.Int,
  in_progress: Schema.Boolean
})

export const AnalyticsOverviewV1 = Schema.Struct({
  currency: Schema.String.annotate({ description: "The workspace's currency, every amount's (minor units)." }),
  a: AnalyticsSpanV1,
  b: AnalyticsSpanV1,
  figures: Schema.Array(Schema.Struct({
    id: Schema.Literals(["revenue", "paid_orders", "on_time", "refund_rate", "disputes", "resolve_hours"]),
    a: Schema.NullOr(Schema.Finite),
    b: Schema.NullOr(Schema.Finite),
    available: Schema.Boolean.annotate({ description: "False where the rows are not kept yet (disputes)." }),
    basis: Schema.Struct({
      rows: Schema.Literals(["orders", "deliveries", "tickets", "disputes"]),
      by: Schema.Literals(["placed", "delivered", "created", "opened"]),
      a_count: Schema.Int,
      b_count: Schema.Int
    }).annotate({ description: "Which rows the figure sums, by which day, and how many stand behind each month." })
  })),
  orders_total: Schema.Int,
  tickets_total: Schema.Int,
  first_order_day: Schema.NullOr(Schema.String),
  unconverted: Schema.Int.annotate({ description: "Store-days left out of the money for want of an exchange rate." })
}).annotate({ identifier: "AnalyticsOverview" })

export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("overview", "/analytics/overview", {
      query: Schema.Struct({ a: AnalyticsMonthV1, b: AnalyticsMonthV1 }),
      success: AnalyticsOverviewV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "Analyse: month `a` against month `b`, both cut to the shorter one's days (a month under way runs to today), in six figures: counted revenue (minor units, each day at its exchange rate), paid orders, on time (% of orders delivered, by the day delivered), refunded (% of orders placed with a refund since), disputes (not kept yet) and hours to done (tickets by the day they came in). Inside the key's stores. Needs `analytics.read`."
    )
  )
  .annotate(OpenApi.Title, "Analytics")
{}

const SheetCellV1 = Schema.Struct({
  v: Schema.String.annotate({ description: "The cell as typed: a value, or a formula starting with `=`." }),
  fmt: Schema.optional(Schema.Literals(["general", "money", "percent", "number", "integer"])),
  bold: Schema.optional(Schema.Boolean),
  align: Schema.optional(Schema.Literals(["left", "center", "right"]))
})

const SheetTabV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  cells: Schema.Record(Schema.String, SheetCellV1).annotate({ description: "Address (`A1`…`L40`) → cell." }),
  widths: Schema.Record(Schema.String, Schema.Int).annotate({ description: "Column (`A`…`L`) → width in pixels." })
})

export const SheetSummaryV1 = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  folder_id: Schema.NullOr(Schema.String),
  owner_id: Schema.String.annotate({ description: "The member who made it." }),
  shared_with: Schema.Array(Schema.String).annotate({ description: "The members it is shared with." }),
  pinned: Schema.Boolean,
  archived: Schema.Boolean,
  linked: Schema.Boolean.annotate({ description: "Whether any cell reads one of Insyte's figures (INSYTE())." }),
  created_at: Schema.String,
  updated_at: Schema.String
}).annotate({ identifier: "SheetSummary" })

export const SheetListV1 = Schema.Struct({ data: Schema.Array(SheetSummaryV1) }).annotate({ identifier: "SheetList" })

export const SheetV1 = Schema.Struct({
  ...SheetSummaryV1.fields,
  folder_name: Schema.NullOr(Schema.String),
  version: Schema.Int.annotate({ description: "The version the tabs are at; every save of the tabs raises it." }),
  tabs: Schema.Array(SheetTabV1).annotate({
    description:
      "Every tab as typed. Nothing computed is kept: a formula is the text the member wrote, and an INSYTE() figure is read when the sheet is opened."
  })
}).annotate({ identifier: "Sheet" })

export class SheetsGroup extends HttpApiGroup.make("sheets")
  .add(
    HttpApiEndpoint.get("list", "/sheets", {
      success: SheetListV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Rekenbladen: the sheets of the member who made the key (their own and those shared with them), newest change first, archived ones included. Needs `data.read`."
    ),
    HttpApiEndpoint.get("get", "/sheets/:id", {
      params: ById,
      success: SheetV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One sheet with every tab as typed (cells, formats, column widths). Needs `data.read`; a sheet the key's member cannot open is not found."
    )
  )
  .annotate(OpenApi.Title, "Sheets")
{}

export class QueueGroup extends HttpApiGroup.make("queue")
  .add(
    HttpApiEndpoint.get("queue", "/queue", {
      query: Schema.Struct({ tab: Schema.optional(QueueTabV1) }),
      success: QueuePageV1
    }).annotate(
      OpenApi.Description,
      "What needs the team on Start, ranked by how soon: a delayed order, a return waiting for review, a quality check sent in, a sold-out variant, a store without its link. `needs_you` (the default) is what is red or amber; `all` adds the rest and what was seen in the last day. The rows narrow to what the key's scopes may read."
    )
  )
  .annotate(OpenApi.Title, "Queue")
{}

export class ProposalsGroup extends HttpApiGroup.make("proposals")
  .add(
    HttpApiEndpoint.get("proposal", "/proposals/:id", {
      params: ById,
      success: ProposalV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One plate Insyte drew for a queue row: what it found, the record as it stands and as drawn, how sure the rule is and why, and what filing runs. Readable with the scope of its record (`returns.read`, `products.read`)."
    ),
    HttpApiEndpoint.post("file", "/proposals/:id/file", {
      params: ById,
      headers: Writes,
      success: ProposalV1,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Files a plate: the command it carries runs as this key, with the scopes that command needs (approving a return takes `returns.write` and `returns.approve`; the delay mail `orders.write`; a reorder ticket `support.write`). A plate no longer open, or whose record moved on, is refused (`409`, `closed` or `stale`); one whose command did not go (`execution_failed`) is tried again."
    )
  )
  .annotate(OpenApi.Title, "Proposals")
{}

/** A flow (M12 step 1): its definition, as the builder holds it. */
export const AutomationStepV1 = Schema.Struct({
  id: Schema.String,
  step: Schema.String.annotate({ description: "The step's kind, as `trigger.order_shipped` or `action.send_email`." }),
  config: Schema.Record(Schema.String, Schema.Unknown),
  branches: Schema.optional(
    Schema.Struct({
      yes: Schema.Array(
        Schema.Struct({ id: Schema.String, step: Schema.String, config: Schema.Record(Schema.String, Schema.Unknown) })
      ),
      no: Schema.Array(
        Schema.Struct({ id: Schema.String, step: Schema.String, config: Schema.Record(Schema.String, Schema.Unknown) })
      )
    })
  ).annotate({ description: "A yes/no split's two lanes, which merge back into the line after it." })
})

export const AutomationV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  status: Schema.String.annotate({ description: "draft (never published), active or paused." }),
  live_version: Schema.Int.annotate({ description: "The published version that runs; 0 for a draft." }),
  trigger: Schema.NullOr(Schema.String).annotate({ description: "The draft's trigger step, if it has one." }),
  unpublished_changes: Schema.Boolean,
  owner: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
  runs_total: Schema.Int,
  saved_at: Schema.String,
  created_at: Schema.String
})

export const AutomationPageV1 = Schema.Struct({
  data: Schema.Array(AutomationV1),
  counts: Schema.Struct({ all: Schema.Int, active: Schema.Int, paused: Schema.Int, draft: Schema.Int })
})

export const AutomationDetailV1 = Schema.Struct({
  ...AutomationV1.fields,
  draft: Schema.Array(AutomationStepV1),
  live: Schema.NullOr(Schema.Array(AutomationStepV1)),
  versions: Schema.Array(
    Schema.Struct({
      version: Schema.Int,
      note: Schema.String,
      published_at: Schema.String,
      published_by: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String }))
    })
  ),
  issues: Schema.Array(
    Schema.Struct({
      step_id: Schema.NullOr(Schema.String),
      code: Schema.String,
      field: Schema.NullOr(Schema.String),
      severity: Schema.String.annotate({ description: "error stops publishing; warning does not." }),
      message: Schema.String
    })
  )
})

export const AutomationStatusFilter = Schema.Literals(["draft", "active", "paused"])

/** A flow's run (M12 step 5): one trigger event for one record, on the version that was live when it started. */
export const AutomationRunV1 = Schema.Struct({
  id: Schema.String,
  automation_id: Schema.String,
  version: Schema.Int,
  status: Schema.String.annotate({ description: "running, waiting, succeeded, failed, stopped or skipped." }),
  reason: Schema.NullOr(Schema.String).annotate({ description: "Why it failed, stopped or was skipped." }),
  trigger: Schema.String,
  manual: Schema.Boolean.annotate({ description: "Started by hand (again, or through this API)." }),
  record: Schema.NullOr(Schema.Struct({ type: Schema.String, id: Schema.String, number: Schema.String })),
  started_at: Schema.String,
  finished_at: Schema.NullOr(Schema.String),
  steps: Schema.Array(
    Schema.Struct({
      step_id: Schema.String,
      step: Schema.String,
      lane: Schema.NullOr(Schema.String),
      status: Schema.String.annotate({ description: "ok, error, skipped, waiting, pending or stopped." }),
      explanation: Schema.NullOr(Schema.String)
    })
  ).annotate({ description: "Each step of the run's version and what it did; empty in a list." })
})

export const AutomationRunPageV1 = Schema.Struct({
  data: Schema.Array(AutomationRunV1),
  next_cursor: Schema.NullOr(Schema.String)
})

export const AutomationRunStatusFilter = Schema.Literals([
  "running",
  "waiting",
  "succeeded",
  "failed",
  "stopped",
  "skipped"
])

export class AutomationsGroup extends HttpApiGroup.make("automations")
  .add(
    HttpApiEndpoint.get("automations", "/automations", {
      query: Schema.Struct({ status: Schema.optional(AutomationStatusFilter) }),
      success: AutomationPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's flows, newest first, with each status's count. Needs `automations.read`."
    ),
    HttpApiEndpoint.get("automation", "/automations/:id", {
      params: ById,
      success: AutomationDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One flow: its draft and live steps, its published versions, and what is wrong with the draft per step. Needs `automations.read`."
    ),
    HttpApiEndpoint.get("runs", "/automations/:id/runs", {
      params: ById,
      query: Schema.Struct({
        status: Schema.optional(AutomationRunStatusFilter),
        limit: Schema.optional(Schema.FiniteFromString),
        cursor: Schema.optional(Schema.String)
      }),
      success: AutomationRunPageV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "The flow's runs, newest first, in pages of up to 200. Needs `automations.read`."
    ),
    HttpApiEndpoint.post("startRun", "/automations/:id/runs", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ order_id: Schema.String }),
      success: AutomationRunV1,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Runs the flow's live version for one order now, as its trigger would, and answers the run as it started; its steps act as the flow's own service account. Refused for a flow never published (`409`, `not_published`); a paused flow's run is written `skipped`. Needs `automations.write`."
    )
  )
  .annotate(OpenApi.Title, "Automations")
{}

/** A chargeback (M13): a payment the shopper disputed at Stripe, Klarna or PayPal, or a case opened by hand. */
export const Chargeback = Schema.Struct({
  id: Schema.String,
  case_number: Schema.String,
  provider: Schema.Literals(["stripe", "klarna", "paypal"]),
  from_provider: Schema.Boolean.annotate({
    description: "The case came in through a payment connection; false for one opened by hand in Insyte."
  }),
  status: Schema.Literals(["open", "awaiting_evidence", "submitted", "won", "lost"]),
  reason: Schema.String.annotate({
    description: "item_not_received, not_as_described, unauthorized, duplicate or other."
  }),
  reason_code: Schema.String.annotate({ description: "The reason as the provider or the team named it." }),
  amount: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String }),
  customer: Schema.Struct({ id: Schema.NullOr(Schema.String), name: Schema.String }),
  order: Schema.NullOr(Schema.Struct({ id: Schema.String, number: Schema.NullOr(Schema.String) })),
  store_id: Schema.NullOr(Schema.String),
  deadline_at: Schema.String.annotate({ description: "When the evidence must be in at the provider." }),
  opened_at: Schema.String,
  submitted_at: Schema.NullOr(Schema.String),
  outcome_at: Schema.NullOr(Schema.String),
  note: Schema.String,
  evidence_count: Schema.Int
}).annotate({ identifier: "Chargeback" })

export const ChargebackStatsV1 = Schema.Struct({
  open: Schema.Int,
  won: Schema.Int,
  decided: Schema.Int,
  won_pct: Schema.Int.annotate({ description: "Won out of decided, in whole percent." }),
  recovered: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String })
})

export const ChargebackPageV1 = Schema.Struct({
  data: Schema.Array(Chargeback),
  counts: Schema.Struct({
    all: Schema.Int,
    action_required: Schema.Int,
    submitted: Schema.Int,
    won: Schema.Int,
    lost: Schema.Int
  }),
  stats: ChargebackStatsV1
}).annotate({ identifier: "ChargebackPage" })

export const ChargebackDetailV1 = Schema.Struct({
  ...Chargeback.fields,
  evidence: Schema.Array(Schema.Struct({
    id: Schema.String,
    kind: Schema.String,
    source: Schema.Literals(["insyte", "upload"]),
    name: Schema.String,
    size_bytes: Schema.Int,
    file_id: Schema.NullOr(Schema.String),
    added_at: Schema.String
  })).annotate({ description: "The pack, in its order." }),
  timeline: Schema.Array(Schema.Struct({
    id: Schema.String,
    at: Schema.String,
    kind: Schema.String,
    actor: Schema.Struct({ kind: Schema.String, name: Schema.String }),
    data: Schema.Record(Schema.String, Schema.Unknown)
  })).annotate({ description: "Oldest first." })
}).annotate({ identifier: "ChargebackDetail" })

export const ChargebackTabV1 = Schema.Literals(["action_required", "submitted", "won", "lost"])

export class ChargebacksGroup extends HttpApiGroup.make("chargebacks")
  .add(
    HttpApiEndpoint.get("chargebacks", "/chargebacks", {
      query: Schema.Struct({
        tab: Schema.optional(ChargebackTabV1),
        provider: Schema.optional(Schema.Literals(["stripe", "klarna", "paypal"]))
      }),
      success: ChargebackPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Chargebacks, nearest deadline first, up to 500: action_required (open or waiting for evidence), submitted, won or lost; with each tab's count and the workspace's record. Needs `chargebacks.read`."
    ),
    HttpApiEndpoint.get("chargeback", "/chargebacks/:id", {
      params: ById,
      success: ChargebackDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One chargeback with its evidence pack and its timeline. Needs `chargebacks.read`."
    )
  )
  .annotate(OpenApi.Title, "Chargebacks")
{}

const MonthV1 = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).annotate({
  description: "A calendar month, YYYY-MM, in store time."
})

export const MonthFiguresV1 = Schema.Struct({
  month: Schema.String,
  revenue_minor: Schema.Int.annotate({ description: "Counted revenue (paid, not cancelled or refunded)." }),
  orders: Schema.Int.annotate({ description: "Counted orders." }),
  ads_minor: Schema.Int,
  other_minor: Schema.Int,
  costs_minor: Schema.Int,
  net_minor: Schema.Int,
  margin: Schema.Finite.annotate({ description: "net / revenue, 0 without revenue." }),
  roas: Schema.Finite.annotate({ description: "revenue / ad spend, 0 without ad spend." })
}).annotate({ identifier: "MonthFigures" })

export const CostLineV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(["fixed", "per_order", "percent", "ads"]),
  rate: Schema.NullOr(Schema.Finite).annotate({ description: "percent: the share of revenue, 0 to 100." }),
  rate_minor: Schema.NullOr(Schema.Int).annotate({ description: "per_order: the amount per counted order." }),
  source: Schema.Literals(["manual", "meta", "google_ads"]),
  reads_from_source: Schema.Boolean.annotate({
    description: "An ad line whose account is connected: its untyped months are what the account reports."
  }),
  months: Schema.Array(Schema.Struct({
    month: Schema.String,
    amount_minor: Schema.Int,
    typed: Schema.Boolean,
    source: Schema.Literals(["typed", "account", "rule", "none"])
  }))
}).annotate({ identifier: "CostLine" })

export const CostsV1 = Schema.Struct({
  currency: Schema.String.annotate({ description: "The workspace's currency, every amount's (minor units)." }),
  months: Schema.Array(Schema.String),
  current: Schema.String.annotate({ description: "The month in progress." }),
  lines: Schema.Array(CostLineV1),
  figures: Schema.Array(MonthFiguresV1)
}).annotate({ identifier: "Costs" })

export const CostFiguresV1 = Schema.Struct({
  currency: Schema.String,
  data: Schema.Array(MonthFiguresV1)
}).annotate({ identifier: "CostFigures" })

export class CostsGroup extends HttpApiGroup.make("costs")
  .add(
    HttpApiEndpoint.get("costs", "/costs", {
      query: Schema.Struct({ from: Schema.optional(MonthV1), to: Schema.optional(MonthV1) }),
      success: CostsV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "Kosten: every cost line with what it costs in each month of the range (by default the five months up to the current one, at most 36), and each month's figures from revenue to net profit. Revenue is the counted orders' in the key's stores. Needs `analytics.read`."
    ),
    HttpApiEndpoint.get("figures", "/costs/figures", {
      query: Schema.Struct({
        months: Schema.String.annotate({ description: "Comma-separated months, YYYY-MM, up to 36." })
      }),
      success: CostFiguresV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "The month figures alone: revenue, orders, ad spend, other costs, net profit, margin and ROAS. Needs `analytics.read`."
    )
  )
  .annotate(OpenApi.Title, "Costs")
{}

/* ── outbound webhooks ───────────────────────────────────────────────────────────────────────────── */

/**
 * Outbound webhooks (M19.4, api.md §7) are managed in the console, not through a key; the document describes what an
 * endpoint receives, so a receiver can be written against it: the envelope, the headers, the signature, and the
 * catalogue (`@insyte/domain/Webhooks`), each event marked when Insyte sends it today.
 */
const LIVE = new Set(LIVE_WEBHOOK_EVENTS)

export const WEBHOOKS_DESCRIPTION = [
  "## Webhooks",
  "",
  "Endpoints are added in Instellingen → Webhooks. Insyte POSTs one JSON envelope per event: " +
  "`{ id, type, api_version, created_at, workspace_id, store_id, data }`, `data` being the record in the endpoint's " +
  "API version. A test send has `\"test\": true` and an empty `data`.",
  "",
  "Headers: `Insyte-Event` (the type), `Insyte-Delivery` (this delivery), `Insyte-Api-Version`, and " +
  "`Insyte-Signature: t=<unix>,v1=<hex>`, where `v1` is `hex(hmac_sha256(secret, t + \".\" + raw_body))`. During a " +
  "secret rotation two `v1` values are sent for 24 hours; accept either. Refuse a `t` older than " +
  `${WEBHOOK_SIGNATURE_TOLERANCE_SECONDS} seconds (replays), and compare in constant time.`,
  "",
  "Answer with a 2xx within 10 seconds. Anything else, a redirect or a time-out is a failure and is tried again on the " +
  "endpoint's policy (1 m, 10 m, 1 h, 3 h, 6 h, 12 h, 24 h, 72 h). After " +
  `${WEBHOOK_AUTO_DISABLE_AFTER} failed attempts in a row Insyte switches the endpoint off. ` +
  "Order is not guaranteed and an event may arrive twice: order by `created_at`, dedupe on `id`.",
  "",
  "Before each attempt Insyte resolves the endpoint's name and refuses one that points at a private or internal " +
  "address. That check is defence in depth, not a guarantee against a name that answers differently a moment later " +
  "(DNS rebinding): authenticate every request by its signature, never by where it came from.",
  "",
  "| Group | Events (✓ sent today) |",
  "| --- | --- |",
  ...WEBHOOK_EVENT_GROUPS.map((g) =>
    `| ${g.group} | ${g.events.map((e) => `\`${e.id}\`${LIVE.has(e.id) ? " ✓" : ""}`).join(", ")} |`
  )
].join("\n")

/** The catalogue as OpenAPI 3.1 `webhooks`: one POST per event, its body the envelope. */
const webhooksSection = (spec: Record<string, unknown>): Record<string, unknown> => ({
  ...spec,
  webhooks: Object.fromEntries(WEBHOOK_EVENT_GROUPS.flatMap((g) =>
    g.events.map((e) => [e.id, {
      post: {
        summary: e.id,
        description: LIVE.has(e.id) ? "Sent today." : "Listed; sent once its slice records the fact.",
        tags: ["Webhooks"],
        parameters: [
          { name: "Insyte-Signature", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Event", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Delivery", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Api-Version", in: "header", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id", "type", "api_version", "created_at", "workspace_id", "store_id", "data"],
                properties: {
                  id: { type: "string" },
                  type: { type: "string", const: e.id },
                  api_version: { type: "string" },
                  created_at: { type: "string", format: "date-time" },
                  workspace_id: { type: "string" },
                  store_id: { type: ["string", "null"] },
                  test: { type: "boolean" },
                  data: { type: "object" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Any 2xx within 10 seconds." } }
      }
    }])
  ))
})

export class PublicApi extends HttpApi.make("insyte")
  .add(
    KeyGroup,
    TeamGroup,
    CommerceGroup,
    OrdersGroup,
    ForwardingGroup,
    ReturnsGroup,
    TicketsGroup,
    AutomationsGroup,
    AnalyticsGroup,
    SheetsGroup,
    QueueGroup,
    ProposalsGroup,
    ChargebacksGroup,
    CostsGroup
  )
  .middleware(ApiKeyAuth)
  .prefix("/v1")
  .annotate(OpenApi.Title, "Insyte API")
  .annotate(OpenApi.Version, "1")
  .annotate(OpenApi.Description, WEBHOOKS_DESCRIPTION)
  .annotate(OpenApi.Transform, webhooksSection)
{}

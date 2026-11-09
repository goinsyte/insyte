import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
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
/** The `Idempotency-Key` was first used for a different request. */
export const IdempotencyKeyReusedV1 = envelope("IdempotencyKeyReusedV1", 422, {})

export type ScopeMissingV1 = typeof ScopeMissingV1.Type
export type NotFoundV1 = typeof NotFoundV1.Type
export type ConflictV1 = typeof ConflictV1.Type
export type ValidationFailedV1 = typeof ValidationFailedV1.Type
export type RefundOverLimitV1 = typeof RefundOverLimitV1.Type
export type IdempotencyKeyReusedV1 = typeof IdempotencyKeyReusedV1.Type
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

export class OrdersGroup extends HttpApiGroup.make("orders")
  .add(
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

export class PublicApi extends HttpApi.make("insyte")
  .add(KeyGroup, TeamGroup, CommerceGroup, OrdersGroup)
  .middleware(ApiKeyAuth)
  .prefix("/v1")
  .annotate(OpenApi.Title, "Insyte API")
  .annotate(OpenApi.Version, "1")
{}

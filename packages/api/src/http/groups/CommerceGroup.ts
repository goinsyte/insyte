import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestV1, ScopeMissingV1 } from "../Errors.ts"
import { ListQuery, Page } from "../Paging.ts"

/* The commerce mirror (M6.4): the orders, products and customers as Shopify holds them, in pages. */

export const Money = Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String })

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
  stock: Schema.NullOr(Schema.Literals(["available", "low", "out"])).annotate({
    description:
      "`available` against the low-stock threshold, by the emptiest variant; null until Shopify reported stock."
  }),
  avg_delivery_days: Schema.NullOr(Schema.Finite).annotate({
    description: "Days from order to delivery, on average over its last delivered orders."
  }),
  lead_days: Schema.NullOr(Schema.Int).annotate({ description: "The primary supplier's delivery time, in days." }),
  updated_at: Schema.String
}).annotate({ identifier: "Product" })

export const LowStockProduct = Schema.Struct({
  id: Schema.String,
  store_id: Schema.String,
  title: Schema.String,
  image: Schema.NullOr(Schema.String),
  status: Schema.String,
  stock: Schema.Literals(["low", "out"]),
  available: Schema.Int,
  variants: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    sku: Schema.NullOr(Schema.String),
    available: Schema.Int
  })),
  sold_last_30_days: Schema.Int,
  open_orders: Schema.Int,
  days_left: Schema.NullOr(Schema.Finite),
  supplier: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String) })),
  lead_days: Schema.NullOr(Schema.Int)
}).annotate({ identifier: "LowStockProduct" })

export const LowStockQuery = Schema.Struct({
  store_id: Schema.optional(Schema.String),
  threshold: Schema.optional(Schema.FiniteFromString),
  limit: Schema.optional(Schema.FiniteFromString)
})
export type LowStockQuery = typeof LowStockQuery.Type

export const LowStockV1 = Schema.Struct({ data: Schema.Array(LowStockProduct), threshold: Schema.Int })

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

export const OrderPageV1 = Page(Order)
export const ProductPageV1 = Page(Product)
export const CustomerPageV1 = Page(Customer)

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
    HttpApiEndpoint.get("lowStock", "/products/low-stock", {
      query: LowStockQuery,
      success: LowStockV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The products running low: a variant at or under `threshold` units over every location (the workspace's default, 12, if not given), sold out first, then the soonest to run out at the last 30 days' pace. Archived products are left out. Read only. Needs `products.read`."
    ),
    HttpApiEndpoint.get("customers", "/customers", {
      query: ListQuery,
      success: CustomerPageV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(OpenApi.Description, "The workspace's customers by name. Needs `customers.read`.")
  )
  .annotate(OpenApi.Title, "Commerce")
{}

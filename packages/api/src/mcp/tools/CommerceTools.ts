import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { InvalidRequestV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { CustomerPageV1, OrderPageV1, ProductPageV1 } from "../../http/groups/CommerceGroup.ts"
import { asKey } from "../Shared.ts"

/* The commerce mirror's lists (M19.3): orders, products and customers, in the `/v1` list's pages. */

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

export const CommerceTools = Toolkit.make(
  ListOrders,
  ListProducts,
  ListCustomers
)

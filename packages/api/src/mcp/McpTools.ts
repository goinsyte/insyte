import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import {
  CurrentApiKey,
  CustomerPageV1,
  InvalidRequestV1,
  Me,
  Member,
  OrderPageV1,
  ProductPageV1,
  Role,
  ScopeMissingV1
} from "../http/PublicApi.ts"

/*
 * The MCP server's tools (M19.3): what an agent with an API key may read, in the public API's shapes. The same key,
 * the same scopes, the same request log; inviting, removing and changing roles stay with people.
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

export const InsyteTools = Toolkit.make(Whoami, ListMembers, ListRoles, ListOrders, ListProducts, ListCustomers)

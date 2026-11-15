import { read } from "@insyte/api/mcp/Shared"
import { Effect, Layer, Schema } from "effect"
import { McpSchema, McpServer } from "effect/ai"
import { json, listedTo } from "../mcp/Resources.ts"
import { OrdersV1 } from "./OrdersV1.ts"

/*
 * `insyte://orders/{id}` (M19.3): one order as `get_order` answers it, in the key's stores. Its template is named to a
 * key with orders.read; any other is refused by the use case.
 */

export const OrderResource = Layer.unwrap(
  Effect.map(
    Effect.service(OrdersV1),
    (orders) =>
      McpServer.resource`insyte://orders/${McpSchema.param("id", Schema.String)}`({
        name: "order",
        description:
          "One order by its id (ord_…, as list_orders gives it): lines, amounts, the shopper, addresses, tags and the internal note. Needs orders.read; only orders in the key's stores.",
        mimeType: "application/json",
        content: (uri, id) => json(uri, orders.order(id))
      })
  )
).pipe(Layer.provide(listedTo(read("orders")).layer), Layer.provide(OrdersV1.layer))

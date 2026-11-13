import { CommerceTools } from "@insyte/api/mcp/tools/CommerceTools"
import { Effect, Layer } from "effect"
import { CommerceV1 } from "./CommerceV1.ts"

export const CommerceMcp = CommerceTools.toLayer(Effect.gen(function*() {
  const read = yield* CommerceV1
  return {
    list_orders: (query) => read.orders(query),
    list_products: (query) => read.products(query),
    list_customers: (query) => read.customers(query)
  }
})).pipe(Layer.provide(CommerceV1.layer))

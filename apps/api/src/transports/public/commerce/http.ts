import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { CommerceV1 } from "./CommerceV1.ts"

export const CommerceHttp = HttpApiBuilder.group(
  PublicApi,
  "commerce",
  (handlers) =>
    Effect.map(
      Effect.service(CommerceV1),
      (read) =>
        handlers
          .handle("orders", ({ query }) => read.orders(query))
          .handle("products", ({ query }) => read.products(query))
          .handle("lowStock", ({ query }) => read.lowStock(query))
          .handle("customers", ({ query }) => read.customers(query))
    )
).pipe(Layer.provide(CommerceV1.layer))

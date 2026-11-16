import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { CustomerAgentV1 } from "./CustomerAgentV1.ts"

export const CustomerAgentHttp = HttpApiBuilder.group(
  PublicApi,
  "customer_agent",
  (handlers) =>
    Effect.map(
      Effect.service(CustomerAgentV1),
      (read) => handlers.handle("get", () => read.settings).handle("today", () => read.today)
    )
).pipe(Layer.provide(CustomerAgentV1.layer))

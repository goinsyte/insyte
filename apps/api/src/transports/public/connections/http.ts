import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { ConnectionsV1 } from "./ConnectionsV1.ts"

export const ConnectionsHttp = HttpApiBuilder.group(
  PublicApi,
  "connections",
  (handlers) => Effect.map(Effect.service(ConnectionsV1), (act) => handlers.handle("health", () => act.health()))
).pipe(Layer.provide(ConnectionsV1.layer))

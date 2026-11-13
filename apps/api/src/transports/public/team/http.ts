import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { TeamV1 } from "./TeamV1.ts"

export const TeamHttp = HttpApiBuilder.group(
  PublicApi,
  "team",
  (handlers) =>
    Effect.map(
      Effect.service(TeamV1),
      (read) => handlers.handle("members", () => read.members).handle("roles", () => read.roles)
    )
).pipe(Layer.provide(TeamV1.layer))

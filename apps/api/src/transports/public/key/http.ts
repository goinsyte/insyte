import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { KeyV1 } from "./KeyV1.ts"

export const KeyHttp = HttpApiBuilder.group(
  PublicApi,
  "key",
  (handlers) => Effect.map(Effect.service(KeyV1), (read) => handlers.handle("me", () => read.me))
).pipe(Layer.provide(KeyV1.layer))

import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { QueueV1 } from "./QueueV1.ts"

export const QueueHttp = HttpApiBuilder.group(
  PublicApi,
  "queue",
  (handlers) =>
    Effect.map(Effect.service(QueueV1), (act) => handlers.handle("queue", ({ query }) => act.queue(query.tab)))
).pipe(Layer.provide(QueueV1.layer))

import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { AskV1 } from "./AskV1.ts"

export const AskHttp = HttpApiBuilder.group(
  PublicApi,
  "ask",
  (handlers) =>
    Effect.map(
      Effect.service(AskV1),
      (act) =>
        handlers
          .handle(
            "ask",
            ({ payload, headers }) => Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.ask(payload, key))
          )
          .handle("threads", () => act.threads())
          .handle("thread", ({ params }) => act.thread(params.id))
    )
).pipe(Layer.provide(AskV1.layer))

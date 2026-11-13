import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { AutomationsV1 } from "./AutomationsV1.ts"

export const AutomationsHttp = HttpApiBuilder.group(
  PublicApi,
  "automations",
  (handlers) =>
    Effect.map(
      Effect.service(AutomationsV1),
      (act) =>
        handlers
          .handle("automations", ({ query }) => act.automations(query.status))
          .handle("automation", ({ params }) => act.automation(params.id))
          .handle("runs", ({ params, query }) => act.runs(params.id, query))
          .handle(
            "startRun",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.startRun(params.id, payload, key))
          )
    )
).pipe(Layer.provide(AutomationsV1.layer))

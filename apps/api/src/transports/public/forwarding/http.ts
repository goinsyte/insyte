import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { ForwardingV1 } from "./ForwardingV1.ts"

export const ForwardingHttp = HttpApiBuilder.group(
  PublicApi,
  "forwarding",
  (handlers) =>
    Effect.map(
      Effect.service(ForwardingV1),
      (act) =>
        handlers
          .handle("suppliers", () => act.suppliers)
          .handle("statements", ({ params }) => act.supplierStatements(params.id))
          .handle("legs", ({ query }) => act.legs(query.view))
          .handle(
            "forward",
            ({ payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.forwardLegs(payload, key))
          )
          .handle(
            "reroute",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.rerouteLeg(params.id, payload, key))
          )
    )
).pipe(Layer.provide(ForwardingV1.layer))

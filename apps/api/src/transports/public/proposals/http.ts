import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { ProposalsV1 } from "./ProposalsV1.ts"

export const ProposalsHttp = HttpApiBuilder.group(
  PublicApi,
  "proposals",
  (handlers) =>
    Effect.map(
      Effect.service(ProposalsV1),
      (act) =>
        handlers
          .handle("proposal", ({ params }) => act.proposal(params.id))
          .handle(
            "file",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.fileProposal(params.id, key))
          )
    )
).pipe(Layer.provide(ProposalsV1.layer))

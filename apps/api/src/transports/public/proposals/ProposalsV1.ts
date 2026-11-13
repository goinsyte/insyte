import { ProposalsService } from "@insyte/modules/proposals/Proposals"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { Context, Effect, Layer } from "effect"
import { conflict, notFound, writeV1 } from "../shared/errors.ts"
import { proposalV1 } from "./present.ts"

/*
 * The plates Insyte draws for the queue's rows (M19.2, M19.3): one read with the scope of its record, and filed as the
 * key, once per `Idempotency-Key`.
 */

const make = Effect.gen(function*() {
  const proposals = yield* ProposalsService
  return {
    proposal: (id: string) => proposals.get(id).pipe(Effect.map(proposalV1), Effect.catchTag("NotFound", notFound)),
    fileProposal: (id: string, key?: string) =>
      Idempotency.once(key, ["proposal.file", id], Effect.map(proposals.file(id), (c) => proposalV1(c.proposal))).pipe(
        Effect.catch((e) =>
          e._tag === "ProposalClosed"
            ? conflict("closed")
            : e._tag === "ProposalStale"
            ? conflict("stale")
            : writeV1(e)
        )
      )
  }
})

/**
 * The plates, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class ProposalsV1 extends Context.Service<ProposalsV1, Effect.Success<typeof make>>()(
  "api-worker/ProposalsV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(ProposalsService.layer))
}

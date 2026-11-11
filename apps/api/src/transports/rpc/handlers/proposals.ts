import { ProposalsRpcs } from "@insyte/api/rpc/ProposalsRpcs"
import { ProposalsService } from "@insyte/modules/proposals/Proposals"
import { Effect } from "effect"

export const ProposalsHandlers = ProposalsRpcs.toLayer(Effect.gen(function*() {
  const proposals = yield* ProposalsService
  return ProposalsRpcs.of({
    "Proposals.get": ({ id }) => proposals.get(id),
    "Proposals.file": ({ id }) => proposals.file(id),
    "Proposals.discard": ({ id }) => proposals.discard(id),
    "Proposals.redraw": ({ id }) => proposals.redraw(id)
  })
}))

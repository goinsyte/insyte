import { ChargebacksRpcs } from "@insyte/api/rpc/ChargebacksRpcs"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { Effect } from "effect"

export const ChargebacksHandlers = ChargebacksRpcs.toLayer(Effect.gen(function*() {
  const chargebacks = yield* ChargebacksService
  return ChargebacksRpcs.of({
    "Chargebacks.list": (input) => chargebacks.list(input),
    "Chargebacks.get": ({ id }) => chargebacks.get(id),
    "Chargebacks.stats": () => chargebacks.stats,
    "Chargebacks.nextCaseNumber": () => chargebacks.nextCaseNumber,
    "Chargebacks.createManual": (input) => chargebacks.createManual(input),
    "Chargebacks.setNote": (input) => chargebacks.setNote(input),
    "Chargebacks.accept": (input) => chargebacks.accept(input),
    "Chargebacks.addEvidence": (input) => chargebacks.addEvidence(input),
    "Chargebacks.removeEvidence": (input) => chargebacks.removeEvidence(input),
    "Chargebacks.reorderEvidence": (input) => chargebacks.reorderEvidence(input)
  })
}))

import { CostsRpcs } from "@insyte/api/rpc/CostsRpcs"
import { CostsService } from "@insyte/modules/costs/Costs"
import { Effect } from "effect"

export const CostsHandlers = CostsRpcs.toLayer(Effect.gen(function*() {
  const costs = yield* CostsService
  return CostsRpcs.of({
    "Costs.list": (input) => costs.list(input),
    "Costs.figures": (input) => costs.figures(input),
    "Costs.create": (input) => costs.create(input),
    "Costs.update": (input) => costs.update(input),
    "Costs.setAmount": (input) => costs.setAmount(input),
    "Costs.readFromSource": ({ id }) => costs.readFromSource(id),
    "Costs.remove": ({ id }) => costs.remove(id)
  })
}))

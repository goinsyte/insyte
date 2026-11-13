import { CostsTools } from "@insyte/api/mcp/tools/CostsTools"
import { Effect, Layer } from "effect"
import { CostsV1 } from "./CostsV1.ts"

export const CostsMcp = CostsTools.toLayer(Effect.gen(function*() {
  const read = yield* CostsV1
  return {
    get_costs: ({ from, to }) => read.costs(from, to),
    get_cost_figures: ({ months }) => read.costFigures(months)
  }
})).pipe(Layer.provide(CostsV1.layer))

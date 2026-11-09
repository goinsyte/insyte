import { FirstAnalysisRpcs } from "@insyte/api/rpc/FirstAnalysisRpcs"
import { FirstAnalysisService } from "@insyte/modules/first-analysis/FirstAnalysis"
import { Effect } from "effect"

export const FirstAnalysisHandlers = FirstAnalysisRpcs.toLayer(Effect.gen(function*() {
  const analysis = yield* FirstAnalysisService
  return FirstAnalysisRpcs.of({
    "FirstAnalysis.get": () => analysis.get,
    "FirstAnalysis.start": () => analysis.start,
    "FirstAnalysis.prepare": (input) => analysis.prepare(input)
  })
}))

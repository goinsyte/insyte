import { Analyses } from "@insyte/modules/first-analysis/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * Starting a store's first analysis (M6.5): a `FirstAnalysisWorkflow` instance named by the analysis, so asking again
 * (a second tab, a return to the step) finds the reading already under way instead of starting another.
 */
export const AnalysesLive = Layer.succeed(Analyses)(Analyses.of({
  start: Effect.fn("Analyses.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.FIRST_ANALYSIS.create({ id: input.key, params: { workspaceId: input.workspaceId, analysisId: input.key } })
    ).pipe(
      // Already started under this name: that instance is the reading.
      Effect.catch(() => Effect.flatMap(Effect.tryPromise(() => env.FIRST_ANALYSIS.get(input.key)), () => Effect.void)),
      Effect.orDie
    )
  })
}))

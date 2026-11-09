import type { Db } from "@insyte/database/Db"
import type { Forbidden } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AnalysisNotReady, FirstAnalysisView, PrepareInput } from "./domain/FirstAnalysis.ts"
import { Analyses } from "./domain/Ports.ts"
import * as Analysis from "./use-cases/analysis.ts"

type R = Db | CurrentPrincipal

/**
 * The first analysis slice (M6.5): the store's early read straight after its first import, the operator's answers,
 * and what they chose to have ready. Starting the reading is a port (the Workflow), taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class FirstAnalysisService extends Context.Service<FirstAnalysisService, {
  readonly get: Effect.Effect<FirstAnalysisView, Forbidden, R>
  readonly start: Effect.Effect<FirstAnalysisView, Forbidden, R>
  readonly prepare: (input: PrepareInput) => Effect.Effect<FirstAnalysisView, Forbidden | AnalysisNotReady, R>
}>()("modules/FirstAnalysisService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    FirstAnalysisService,
    Effect.gen(function*() {
      const analyses = yield* Analyses
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(Analyses, analyses), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        get: run(Analysis.get()),
        start: run(Analysis.start()),
        prepare: (input) => run(Analysis.prepare(input))
      }
    })
  )
}

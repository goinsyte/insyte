import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AutonomyLocked, AutonomyStale } from "../agent/domain/Autonomy.ts"
import type {
  AgreeOfflineInput,
  AnalysisNotReady,
  FirstAnalysisView,
  OfflineAgreed,
  PrepareInput
} from "./domain/FirstAnalysis.ts"
import { Analyses } from "./domain/Ports.ts"
import { Makers } from "./Links.ts"
import * as Analysis from "./use-cases/analysis.ts"

type R = Db | CurrentPrincipal

/**
 * The first analysis slice (M6.5, M15 step 5): the store's finding or early read straight after its first import, the
 * operator's answers, what they chose to have ready (made through the slices that own it), and the offline plan.
 * Starting the reading (the Workflow) and making the items (`Makers`) are ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class FirstAnalysisService extends Context.Service<FirstAnalysisService, {
  readonly get: Effect.Effect<FirstAnalysisView, Forbidden, R>
  readonly start: Effect.Effect<FirstAnalysisView, Forbidden, R>
  readonly prepare: (input: PrepareInput) => Effect.Effect<FirstAnalysisView, Forbidden | AnalysisNotReady, R>
  readonly agreeOffline: (
    input: AgreeOfflineInput
  ) => Effect.Effect<
    OfflineAgreed,
    Forbidden | Invalid | AnalysisNotReady | AutonomyLocked | AutonomyStale,
    R
  >
}>()("modules/FirstAnalysisService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    FirstAnalysisService,
    Effect.gen(function*() {
      const analyses = yield* Analyses
      const makers = yield* Makers
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Analyses, analyses),
          Effect.provideService(Makers, makers),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        get: run(Analysis.get()),
        start: run(Analysis.start()),
        prepare: (input) => run(Analysis.prepare(input)),
        agreeOffline: (input) => run(Analysis.agreeOffline(input))
      }
    })
  )
}

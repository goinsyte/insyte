import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  AnalyticsCharts,
  AnalyticsFigures,
  AnalyticsFindings,
  AnalyticsOverview,
  AnalyticsPeriods,
  ExplainRef,
  Explanation,
  FiguresInput,
  PairInput,
  RecordsInput,
  RecordsPage
} from "./domain/Analytics.ts"
import { CostFigures } from "./domain/Ports.ts"
import * as Analytics from "./use-cases/analytics.ts"
import * as Figures from "./use-cases/figures.ts"

type R = Db | CurrentPrincipal

/**
 * Analyse (M14 step 2): the months on offer, two of them compared in six figures, the charts and the findings, and
 * any of them taken apart down to its orders; and INSYTE()'s figures (M14 step 4), Kosten's read through
 * `CostFigures`. Read only; every read needs Analyse · Bekijken and narrows to the role's stores. A month that has not
 * begun is `Invalid`.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class AnalyticsService extends Context.Service<AnalyticsService, {
  readonly periods: Effect.Effect<AnalyticsPeriods, Forbidden, R>
  readonly overview: (input: PairInput) => Effect.Effect<AnalyticsOverview, Forbidden | Invalid, R>
  readonly charts: (input: PairInput) => Effect.Effect<AnalyticsCharts, Forbidden | Invalid, R>
  readonly findings: (input: PairInput) => Effect.Effect<AnalyticsFindings, Forbidden | Invalid, R>
  readonly explain: (ref: ExplainRef) => Effect.Effect<Explanation, Forbidden | Invalid, R>
  readonly records: (input: RecordsInput) => Effect.Effect<RecordsPage, Forbidden | Invalid, R>
  /** A sheet's INSYTE() lookups (M14 step 4): Data · Bekijken, each figure Analyse · Bekijken. */
  readonly figures: (input: FiguresInput) => Effect.Effect<AnalyticsFigures, Forbidden, R>
  /** The same lookups outside a sheet (`/v1`, MCP): Analyse · Bekijken. */
  readonly lookup: (input: FiguresInput) => Effect.Effect<AnalyticsFigures, Forbidden, R>
}>()("modules/AnalyticsService") {
  // A database that does not answer is a defect, as everywhere. Kosten's months are taken once.
  static readonly layer = Layer.effect(
    AnalyticsService,
    Effect.gen(function*() {
      const costs = yield* CostFigures
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(CostFigures, costs), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        periods: run(Analytics.periods()),
        overview: (input) => run(Analytics.overview(input)),
        charts: (input) => run(Analytics.charts(input)),
        findings: (input) => run(Analytics.findings(input)),
        explain: (ref) => run(Analytics.explain(ref)),
        records: (input) => run(Analytics.records(input)),
        figures: (input) => run(Figures.figures(input)),
        lookup: (input) => run(Figures.lookup(input))
      }
    })
  )
}

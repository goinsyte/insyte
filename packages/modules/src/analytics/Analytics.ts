import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  AnalyticsCharts,
  AnalyticsFindings,
  AnalyticsOverview,
  AnalyticsPeriods,
  ExplainRef,
  Explanation,
  PairInput,
  RecordsInput,
  RecordsPage
} from "./domain/Analytics.ts"
import * as Analytics from "./use-cases/analytics.ts"

type R = Db | CurrentPrincipal

/**
 * Analyse (M14 step 2): the months on offer, two of them compared in six figures, the charts and the findings, and
 * any of them taken apart down to its orders. Read only; every read needs Analyse · Bekijken and narrows to the role's
 * stores. A month that has not begun is `Invalid`.
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
}>()("modules/AnalyticsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(AnalyticsService, {
    periods: Analytics.periods().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    overview: (input) => Analytics.overview(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    charts: (input) => Analytics.charts(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    findings: (input) => Analytics.findings(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    explain: (ref) => Analytics.explain(ref).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    records: (input) => Analytics.records(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

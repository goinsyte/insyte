import { Forbidden, Invalid } from "@insyte/domain/Errors"
import {
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
} from "@insyte/modules/analytics/domain/Analytics"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Refused = Schema.Union([Forbidden, Invalid])

/**
 * Analyse (M14 step 2; api.md §2.13): the months the pickers offer, the six figures for two of them, the charts, the
 * findings, and the explain drawer with its rows a page at a time. Analyse · Bekijken for each; the chosen months are
 * the member's `analytics` preference (`Prefs.patch`).
 */
export class AnalyticsRpcs extends RpcGroup.make(
  Rpc.make("Analytics.periods", { success: AnalyticsPeriods, error: Forbidden }),
  Rpc.make("Analytics.overview", { payload: PairInput, success: AnalyticsOverview, error: Refused }),
  Rpc.make("Analytics.charts", { payload: PairInput, success: AnalyticsCharts, error: Refused }),
  Rpc.make("Analytics.findings", { payload: PairInput, success: AnalyticsFindings, error: Refused }),
  Rpc.make("Analytics.explain", { payload: ExplainRef, success: Explanation, error: Refused }),
  Rpc.make("Analytics.records", { payload: RecordsInput, success: RecordsPage, error: Refused }),
  // A sheet's INSYTE() cells in one batch (M14 step 4): Data · Bekijken; a figure the role may not see is refused in
  // its own answer, not the call.
  Rpc.make("Analytics.figures", { payload: FiguresInput, success: AnalyticsFigures, error: Forbidden })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

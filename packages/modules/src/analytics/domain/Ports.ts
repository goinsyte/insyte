import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * What analytics needs of another slice (architecture.md: never its use-cases/), implemented where the app is composed
 * (`apps/api/src/platform/SliceLinks.ts`).
 */

/** One month as Kosten works it out (domain.md §10.1): minor units in the workspace's currency. */
export interface CostMonth {
  readonly month: string
  readonly revenueMinor: number
  /** The counted orders the per-order lines are multiplied by. */
  readonly orders: number
  readonly adsMinor: number
  readonly otherMinor: number
  readonly costsMinor: number
  readonly netMinor: number
  /** net / revenue, 0 without revenue. */
  readonly margin: number
  /** revenue / ads, 0 without ad spend. */
  readonly roas: number
  /** The ad lines read from Meta, and from Google Ads (a line typed by hand from no account is in neither). */
  readonly metaMinor: number
  readonly googleMinor: number
  /** The store-days whose revenue had no rate into the workspace's currency, left out of revenue. */
  readonly unconverted: number
}

/**
 * Kosten's months (`Costs.figures`), on the caller's transaction, inside the reader's stores: what INSYTE()'s cost,
 * profit and ad figures read, so a sheet and Kosten never disagree. `until` (YYYY-MM-DD) is the last day read, the
 * month under way's today as INSYTE()'s sales read it, so a store already on tomorrow counts in neither. The caller
 * has checked Analyse · Bekijken.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class CostFigures extends Context.Service<CostFigures, {
  readonly months: (
    sql: SqlClient.SqlClient,
    months: ReadonlyArray<string>,
    until: string
  ) => Effect.Effect<ReadonlyArray<CostMonth>, SqlError.SqlError, CurrentPrincipal>
}>()("analytics/CostFigures") {}

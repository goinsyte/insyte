import type { Db } from "@insyte/database/Db"
import type { Forbidden } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { BoardRange, HomeBrief, HomeWidgets, RevenueBreakdown, WidgetsInput } from "./domain/Home.ts"
import * as Figures from "./use-cases/figures.ts"

type R = Db | CurrentPrincipal

/**
 * Start's figures (M10.3): the hero's counts, the pulse band and the board's widgets in one read, and what the revenue
 * figure is made of. Read only; every figure narrows to the areas and stores the role may open.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class HomeService extends Context.Service<HomeService, {
  readonly brief: Effect.Effect<HomeBrief, never, R>
  readonly widgets: (input: WidgetsInput) => Effect.Effect<HomeWidgets, never, R>
  readonly revenueBreakdown: (range: BoardRange) => Effect.Effect<RevenueBreakdown, Forbidden, R>
}>()("modules/HomeService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(HomeService)({
    brief: Figures.brief().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    widgets: (input) => Figures.widgets(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    revenueBreakdown: (range) => Figures.revenueBreakdown(range).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

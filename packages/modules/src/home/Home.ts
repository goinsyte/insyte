import type { Db } from "@insyte/database/Db"
import type { Forbidden } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { InStore } from "../shared/domain/Stores.ts"
import { inStore } from "../shared/use-cases/StoreScope.ts"
import type { BreakdownInput, HomeBrief, HomeWidgets, RevenueBreakdown, WidgetsInput } from "./domain/Home.ts"
import type { ActivityInput, AgendaInput, HomeActivity, HomeAgenda, HomeWork } from "./domain/Lists.ts"
import * as Figures from "./use-cases/figures.ts"
import * as Lists from "./use-cases/lists.ts"

type R = Db | CurrentPrincipal

/**
 * Start's figures (M10.3): the hero's counts, the pulse band and the board's widgets in one read, and what the revenue
 * figure is made of. Read only; every figure narrows to the areas and stores the role may open.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class HomeService extends Context.Service<HomeService, {
  readonly brief: (input: InStore) => Effect.Effect<HomeBrief, never, R>
  readonly widgets: (input: WidgetsInput) => Effect.Effect<HomeWidgets, never, R>
  readonly revenueBreakdown: (input: BreakdownInput) => Effect.Effect<RevenueBreakdown, Forbidden, R>
  /** Mijn werk: what is the member's to do, from every source the role may read. */
  readonly work: (input: InStore) => Effect.Effect<HomeWork, never, R>
  /** The agenda over a day or a week: deadlines and hand-offs with a time, to-dos with a day. */
  readonly agenda: (input: AgendaInput) => Effect.Effect<HomeAgenda, never, R>
  /** The activity feed: the team's, the suppliers' and the services' changes, and the orders placed. */
  readonly activity: (input: ActivityInput) => Effect.Effect<HomeActivity, never, R>
}>()("modules/HomeService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(HomeService)({
    // Each read narrows to one of the principal's stores when it names one (the store switch).
    brief: ({ storeId }) => Figures.brief().pipe(inStore(storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
    widgets: (input) =>
      Figures.widgets(input).pipe(inStore(input.storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
    revenueBreakdown: ({ range, storeId }) =>
      Figures.revenueBreakdown(range).pipe(inStore(storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
    work: ({ storeId }) => Lists.work().pipe(inStore(storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
    agenda: (input) =>
      Lists.agenda(input).pipe(inStore(input.storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
    activity: (input) =>
      Lists.activity(input).pipe(inStore(input.storeId), Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

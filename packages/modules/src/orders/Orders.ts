import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown, ListInput } from "../shared/domain/Filter.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type { OrderDetail, OrderPage } from "./domain/Orders.ts"
import * as Orders from "./use-cases/orders.ts"

type R = Db | CurrentPrincipal

/**
 * The orders slice (M6.4): the mirror's orders, read-only until M7's commands.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class OrdersService extends Context.Service<OrdersService, {
  readonly list: (input: ListInput) => Effect.Effect<OrderPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<OrderDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  /** Orders per status, inside the role's stores. */
  readonly statusCounts: Effect.Effect<Readonly<Record<string, number>>, Forbidden, R>
}>()("modules/OrdersService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(OrdersService, {
    list: (input) => Orders.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Orders.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    search: (q, limit) => Orders.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    statusCounts: Orders.statusCounts().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

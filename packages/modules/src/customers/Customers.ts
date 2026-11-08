import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown, ListInput } from "../shared/domain/Filter.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type { CustomerDetail, CustomerPage } from "./domain/Customers.ts"
import * as Customers from "./use-cases/customers.ts"

type R = Db | CurrentPrincipal

/**
 * The customers slice (M6.4): the mirror's customers, read-only until M7's commands.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class CustomersService extends Context.Service<CustomersService, {
  readonly list: (input: ListInput) => Effect.Effect<CustomerPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<CustomerDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
}>()("modules/CustomersService") {
  static readonly layer = Layer.succeed(CustomersService, {
    list: (input) => Customers.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Customers.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    search: (q, limit) => Customers.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

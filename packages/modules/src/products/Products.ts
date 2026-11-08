import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown, ListInput } from "../shared/domain/Filter.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type { ProductDetail, ProductPage } from "./domain/Products.ts"
import * as Products from "./use-cases/products.ts"

type R = Db | CurrentPrincipal

/**
 * The products slice (M6.4): the mirror's catalogue, read-only until M7's commands.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class ProductsService extends Context.Service<ProductsService, {
  readonly list: (input: ListInput) => Effect.Effect<ProductPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<ProductDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
}>()("modules/ProductsService") {
  static readonly layer = Layer.succeed(ProductsService, {
    list: (input) => Products.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Products.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    search: (q, limit) => Products.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

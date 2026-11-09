import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown, ListInput } from "../shared/domain/Filter.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type { ConnectionGate, ShopifyGraphql } from "../stores/domain/Ports.ts"
import type { EditInput, ProductChange, RepriceInput, RepriceResult, StatusInput } from "./domain/Commands.ts"
import type { ProductDetail, ProductPage } from "./domain/Products.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Products from "./use-cases/products.ts"

type R = Db | CurrentPrincipal
type W = R | Relay

/**
 * The products slice: the mirror's catalogue (M6.4) and the commands on it (M7.3).
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay ShopifyGraphql ConnectionGate
 */
export class ProductsService extends Context.Service<ProductsService, {
  readonly list: (input: ListInput) => Effect.Effect<ProductPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<ProductDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  readonly edit: (input: typeof EditInput.Type) => Effect.Effect<ProductChange, Forbidden | NotFound | Conflict, W>
  readonly setStatus: (input: typeof StatusInput.Type) => Effect.Effect<ProductChange, Forbidden | NotFound, W>
  readonly reprice: (input: typeof RepriceInput.Type) => Effect.Effect<RepriceResult, Forbidden | NotFound, W>
  readonly sync: (
    id: string
  ) => Effect.Effect<void, Forbidden | NotFound | Conflict, R | ShopifyGraphql | ConnectionGate>
}>()("modules/ProductsService") {
  static readonly layer = Layer.succeed(ProductsService, {
    list: (input) => Products.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Products.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    search: (q, limit) => Products.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    edit: (input) => Commands.edit(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setStatus: (input) => Commands.setStatus(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reprice: (input) => Commands.reprice(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    sync: (id) => Commands.sync(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

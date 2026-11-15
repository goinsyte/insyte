import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown } from "../shared/domain/Filter.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import { inStore } from "../shared/use-cases/StoreScope.ts"
import type { CreateInput, CustomerChange, MergeInput, TagInput } from "./domain/Commands.ts"
import type { CustomerCounts, CustomerDetail, CustomerListInput, CustomerPage } from "./domain/Customers.ts"
import type { DuplicateGroup } from "./domain/Duplicates.ts"
import { KlaviyoSyncs } from "./domain/Ports.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Customers from "./use-cases/customers.ts"

type R = Db | CurrentPrincipal
type W = R | Relay

/**
 * The customers slice: the mirror's customers (M6.4), and the commands on them, duplicates and merges (M7.4).
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class CustomersService extends Context.Service<CustomersService, {
  readonly list: (
    input: CustomerListInput
  ) => Effect.Effect<CustomerPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<CustomerDetail, Forbidden | NotFound, R>
  /** The area panel's counts, for the frame: the list's segments. */
  readonly counts: Effect.Effect<CustomerCounts, Forbidden, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  readonly tag: (input: typeof TagInput.Type) => Effect.Effect<CustomerChange, Forbidden | NotFound | Invalid, W>
  readonly create: (input: typeof CreateInput.Type) => Effect.Effect<CustomerChange, Forbidden | Invalid | Conflict, W>
  readonly merge: (
    input: typeof MergeInput.Type
  ) => Effect.Effect<CustomerChange, Forbidden | NotFound | Invalid | Conflict, R>
  readonly duplicates: Effect.Effect<ReadonlyArray<DuplicateGroup>, Forbidden, R>
  readonly markNotDuplicate: (key: string) => Effect.Effect<void, Forbidden, R>
}>()("modules/CustomersService") {
  static readonly layer = Layer.effect(
    CustomersService,
    Effect.gen(function*() {
      const syncs = yield* KlaviyoSyncs
      return {
        // Narrowed as a whole, so the facets and summaries count the one store too (the store switch).
        list: (input) =>
          Customers.list(input).pipe(inStore(input.storeId), Effect.catchIf(SqlError.isSqlError, Effect.die)),
        get: (id) =>
          Customers.get(id).pipe(
            Effect.provideService(KlaviyoSyncs, syncs),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        counts: Customers.counts().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        search: (q, limit) => Customers.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        tag: (input) => Commands.tag(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        create: (input) => Commands.create(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        merge: (input) => Commands.merge(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        duplicates: Commands.duplicates().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        markNotDuplicate: (key) => Commands.markNotDuplicate(key).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      }
    })
  )
}

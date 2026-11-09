import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { CursorInvalid, FilterFieldUnknown, ListInput } from "../shared/domain/Filter.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type { CancelInput, OrderChange, ShippingInput, TagInput } from "./domain/Commands.ts"
import type { OrderDetail, OrderPage } from "./domain/Orders.ts"
import type {
  AlreadyRefunded,
  RefundInput,
  RefundOverBalance,
  RefundOverLimit,
  RefundResult
} from "./domain/Refunds.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Orders from "./use-cases/orders.ts"
import * as Refunds from "./use-cases/refund.ts"

type R = Db | CurrentPrincipal
type W = R | Relay

/**
 * The orders slice: the mirror's orders (M6.4), the commands on them (M7.1) and refunds (M7.2).
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class OrdersService extends Context.Service<OrdersService, {
  readonly list: (input: ListInput) => Effect.Effect<OrderPage, Forbidden | FilterFieldUnknown | CursorInvalid, R>
  readonly get: (id: string) => Effect.Effect<OrderDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  /** Orders per status, inside the role's stores. */
  readonly statusCounts: Effect.Effect<Readonly<Record<string, number>>, Forbidden, R>
  readonly tags: Effect.Effect<ReadonlyArray<{ tag: string; count: number }>, Forbidden, R>
  readonly tag: (input: typeof TagInput.Type) => Effect.Effect<OrderChange, Forbidden | NotFound | Invalid, W>
  readonly markFulfilled: (ids: ReadonlyArray<string>) => Effect.Effect<OrderChange, Forbidden | NotFound | Conflict, W>
  readonly updateShipping: (
    input: typeof ShippingInput.Type
  ) => Effect.Effect<OrderChange, Forbidden | NotFound | Invalid | Conflict, W>
  readonly cancel: (input: typeof CancelInput.Type) => Effect.Effect<OrderChange, Forbidden | NotFound | Conflict, W>
  readonly setNote: (id: string, body: string) => Effect.Effect<void, Forbidden | NotFound, R>
  readonly refund: (
    input: typeof RefundInput.Type
  ) => Effect.Effect<
    RefundResult,
    Forbidden | NotFound | Conflict | RefundOverLimit | RefundOverBalance | AlreadyRefunded,
    W
  >
}>()("modules/OrdersService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(OrdersService, {
    list: (input) => Orders.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Orders.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    search: (q, limit) => Orders.search(q, limit).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    statusCounts: Orders.statusCounts().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    tags: Commands.tags().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    tag: (input) => Commands.tag(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    markFulfilled: (ids) => Commands.markFulfilled(ids).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    updateShipping: (input) => Commands.updateShipping(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    cancel: (input) => Commands.cancel(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setNote: (id, body) => Commands.setNote(id, body).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    refund: (input) => Refunds.refund(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

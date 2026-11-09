import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { Conflict } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AlreadyRefunded, RefundOverBalance, RefundOverLimit } from "../orders/domain/Refunds.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import type {
  ApproveInput,
  AssignInput,
  IllegalReturnMove,
  InspectInput,
  LineNotReturnable,
  ListInput,
  RejectInput,
  ResolutionNotAllowed,
  ResolveInput,
  Returnable,
  ReturnChange,
  ReturnDetail,
  ReturnList,
  ReturnSettingsDoc,
  StartInput
} from "./domain/Returns.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Returns from "./use-cases/returns.ts"
import * as Settings from "./use-cases/settings.ts"

type R = Db | CurrentPrincipal
type W = R | Relay

/**
 * The returns slice (M9.1): returns and claims in one queue, their lifecycle, and the workspace's returns policy.
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class ReturnsService extends Context.Service<ReturnsService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<ReturnList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<ReturnDetail, Forbidden | NotFound, R>
  readonly returnable: (orderId: string) => Effect.Effect<Returnable, Forbidden | NotFound, R>
  readonly start: (
    input: typeof StartInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | Invalid | LineNotReturnable | ResolutionNotAllowed, R>
  readonly approve: (
    input: typeof ApproveInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  readonly reject: (
    input: typeof RejectInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  readonly reopen: (id: string) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  readonly assign: (input: typeof AssignInput.Type) => Effect.Effect<ReturnChange, Forbidden | NotFound, R>
  readonly markReceived: (id: string) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  readonly inspect: (
    input: typeof InspectInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove | LineNotReturnable, R>
  readonly resolve: (
    input: typeof ResolveInput.Type
  ) => Effect.Effect<
    ReturnChange,
    | Forbidden
    | NotFound
    | Invalid
    | Conflict
    | IllegalReturnMove
    | ResolutionNotAllowed
    | RefundOverLimit
    | RefundOverBalance
    | AlreadyRefunded,
    W
  >
  readonly settings: Effect.Effect<ReturnSettingsDoc, Forbidden, R>
  readonly setSettings: (
    doc: ReturnSettingsDoc
  ) => Effect.Effect<{ readonly settings: ReturnSettingsDoc; readonly undo: UndoTicket }, Forbidden | Invalid, R>
}>()("modules/ReturnsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(ReturnsService, {
    list: (input) => Returns.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Returns.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    returnable: (orderId) => Returns.returnable(orderId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    start: (input) => Commands.start(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    approve: (input) => Commands.approve(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reject: (input) => Commands.reject(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reopen: (id) => Commands.reopen(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    assign: (input) => Commands.assign(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    markReceived: (id) => Commands.markReceived(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    inspect: (input) => Commands.inspect(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    resolve: (input) => Commands.resolve(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    settings: Settings.get().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setSettings: (doc) => Settings.set(doc).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { Conflict } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AlreadyRefunded, RefundOverBalance, RefundOverLimit } from "../orders/domain/Refunds.ts"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import { Labels, Refunder } from "./domain/Ports.ts"
import type {
  AddTrackingInput,
  ApproveInput,
  AssignInput,
  IllegalReturnMove,
  InspectInput,
  LabelNotPossible,
  LabelsUnavailable,
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
  SendLabelInput,
  StartInput
} from "./domain/Returns.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Returns from "./use-cases/returns.ts"
import * as Settings from "./use-cases/settings.ts"

type R = Db | CurrentPrincipal
type W = R | Relay

/**
 * The returns slice (M9.1): returns and claims in one queue, their lifecycle, and the workspace's returns policy. What
 * reaches the shopper or Shopify (M9.3) waits in the outbox for the undo window.
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class ReturnsService extends Context.Service<ReturnsService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<ReturnList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<ReturnDetail, Forbidden | NotFound, R>
  readonly returnable: (orderId: string) => Effect.Effect<Returnable, Forbidden | NotFound, R>
  readonly start: (
    input: typeof StartInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | Invalid | LineNotReturnable | ResolutionNotAllowed, W>
  readonly approve: (
    input: typeof ApproveInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, W>
  readonly reject: (
    input: typeof RejectInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, W>
  readonly reopen: (id: string) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  readonly assign: (input: typeof AssignInput.Type) => Effect.Effect<ReturnChange, Forbidden | NotFound, R>
  /** "Tracking invullen" ("zelf versturen", M9.2): the shopper's own carrier and tracking number. */
  readonly addTracking: (
    input: typeof AddTrackingInput.Type
  ) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, R>
  /** "Label versturen" (M9.2): asked for now, made at the carrier once the undo window has passed. */
  readonly sendLabel: (
    input: typeof SendLabelInput.Type
  ) => Effect.Effect<
    ReturnChange,
    Forbidden | NotFound | IllegalReturnMove | LabelsUnavailable | LabelNotPossible,
    W
  >
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
  /** "Opnieuw proberen" (M9.3): a resolution Shopify did not make, asked again. */
  readonly retryResolution: (id: string) => Effect.Effect<ReturnChange, Forbidden | NotFound | IllegalReturnMove, W>
  readonly settings: Effect.Effect<ReturnSettingsDoc, Forbidden, R>
  readonly setSettings: (
    doc: ReturnSettingsDoc
  ) => Effect.Effect<{ readonly settings: ReturnSettingsDoc; readonly undo: UndoTicket }, Forbidden | Invalid, R>
}>()("modules/ReturnsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    ReturnsService,
    Effect.gen(function*() {
      const refunder = yield* Refunder
      const labels = yield* Labels
      return {
        list: (input) =>
          Returns.list(input).pipe(
            Effect.provideService(Labels, labels),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        get: (id) =>
          Returns.get(id).pipe(Effect.provideService(Labels, labels), Effect.catchIf(SqlError.isSqlError, Effect.die)),
        returnable: (orderId) => Returns.returnable(orderId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        start: (input) => Commands.start(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        approve: (input) => Commands.approve(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        reject: (input) => Commands.reject(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        reopen: (id) => Commands.reopen(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        assign: (input) => Commands.assign(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        addTracking: (input) => Commands.addTracking(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        sendLabel: (input) =>
          Commands.sendLabel(input).pipe(
            Effect.provideService(Labels, labels),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        markReceived: (id) => Commands.markReceived(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        inspect: (input) => Commands.inspect(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        resolve: (input) =>
          Commands.resolve(input).pipe(
            Effect.provideService(Refunder, refunder),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        retryResolution: (id) => Commands.retryResolution(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        settings: Settings.get().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        setSettings: (doc) => Settings.set(doc).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      }
    })
  )
}

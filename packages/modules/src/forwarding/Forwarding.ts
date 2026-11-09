import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type {
  ForwardingChange,
  ForwardInput,
  ForwardView,
  IdsInput,
  LegList,
  LegRow,
  RerouteInput
} from "./domain/Forwarding.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Legs from "./use-cases/legs.ts"

type R = Db | CurrentPrincipal

/**
 * The forwarding slice (M8.2): the Doorsturen queue and the commands on its legs.
 *
 * @effect-expect-leaking Db CurrentPrincipal Relay
 */
export class ForwardingService extends Context.Service<ForwardingService, {
  readonly list: (view: ForwardView | undefined) => Effect.Effect<LegList, Forbidden, R>
  readonly forOrder: (orderId: string) => Effect.Effect<ReadonlyArray<LegRow>, Forbidden, R>
  readonly forward: (
    input: typeof ForwardInput.Type
  ) => Effect.Effect<ForwardingChange, Forbidden | NotFound | Conflict, R | Relay>
  readonly markConfirmed: (input: typeof IdsInput.Type) => Effect.Effect<ForwardingChange, Forbidden | NotFound, R>
  readonly reroute: (
    input: typeof RerouteInput.Type
  ) => Effect.Effect<ForwardingChange, Forbidden | NotFound | Conflict, R>
  readonly cancel: (input: typeof IdsInput.Type) => Effect.Effect<ForwardingChange, Forbidden | NotFound, R>
}>()("modules/ForwardingService") {
  static readonly layer = Layer.succeed(ForwardingService, {
    list: (view) => Legs.list(view).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    forOrder: (orderId) => Legs.forOrder(orderId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    forward: (input) => Commands.forward(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    markConfirmed: (input) => Commands.markConfirmed(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reroute: (input) => Commands.reroute(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    cancel: (input) => Commands.cancel(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { OrderTracking } from "./domain/Tracking.ts"
import * as Use from "./use-cases/tracking.ts"

/**
 * The tracking slice's reads (M8.4); the sweep and the webhook run outside a request.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class TrackingService extends Context.Service<TrackingService, {
  readonly forOrder: (orderId: string) => Effect.Effect<OrderTracking, Forbidden | NotFound, Db | CurrentPrincipal>
}>()("modules/TrackingService") {
  static readonly layer = Layer.succeed(TrackingService, {
    forOrder: (orderId) => Use.forOrder(orderId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

import type { Db } from "@insyte/database/Db"
import type { Invalid } from "@insyte/domain/Errors"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { FileStore } from "../shared/domain/Documents.ts"
import { Sealer } from "../shared/domain/Sealer.ts"
import type {
  OrderNotFound,
  PhotoRequired,
  PortalNotFound,
  PortalOrder,
  PortalStarted,
  PortalStartInput,
  PortalStore,
  PortalTokenExpired
} from "./domain/Portal.ts"
import type { LineNotReturnable, ResolutionNotAllowed } from "./domain/Returns.ts"
import * as Portal from "./use-cases/portal.ts"

/**
 * The public returns portal (M9.3): a store's page, an order found by its number and address, a photo, and the
 * request. No principal: the handle and then the sealed token decide the workspace and the order. Rate limits and
 * Turnstile are the transport's, in front of these.
 *
 * @effect-expect-leaking Db
 */
export class PortalService extends Context.Service<PortalService, {
  readonly store: (handle: string) => Effect.Effect<PortalStore, PortalNotFound, Db>
  readonly lookup: (
    input: { readonly handle: string; readonly number: string; readonly email: string }
  ) => Effect.Effect<PortalOrder, PortalNotFound | OrderNotFound, Db>
  /** The order a token names, for the transport's limits; fails like any call with a spent token. */
  readonly orderOf: (token: string) => Effect.Effect<string, PortalTokenExpired>
  readonly upload: (
    input: { readonly token: string; readonly name: string; readonly mime: string; readonly bytes: Uint8Array }
  ) => Effect.Effect<{ readonly id: string }, PortalTokenExpired | Invalid, Db>
  readonly start: (
    input: typeof PortalStartInput.Type
  ) => Effect.Effect<
    PortalStarted,
    PortalNotFound | PortalTokenExpired | Invalid | PhotoRequired | LineNotReturnable | ResolutionNotAllowed,
    Db
  >
}>()("modules/PortalService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    PortalService,
    Effect.gen(function*() {
      const sealer = yield* Sealer
      const files = yield* FileStore
      const ports = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(Effect.provideService(Sealer, sealer), Effect.provideService(FileStore, files))
      return {
        store: (handle) => ports(Portal.store(handle)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        lookup: (input) => ports(Portal.lookup(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        orderOf: (token) => ports(Portal.openToken(token)).pipe(Effect.map((claims) => claims.orderId)),
        upload: (input) => ports(Portal.upload(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
        start: (input) => ports(Portal.start(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      }
    })
  )
}

import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import { Sealer } from "../shared/domain/Sealer.ts"
import { ShopifyAdmin } from "./domain/Ports.ts"
import type {
  BeginConnect,
  ConnectFailed,
  ShopifyUnavailable,
  ShopNotFound,
  StoreConnectedElsewhere,
  StoreView
} from "./domain/Stores.ts"
import * as Connect from "./use-cases/connect.ts"
import * as Stores from "./use-cases/stores.ts"

type R = Db | CurrentPrincipal

/**
 * The stores slice (M6.2): the workspace's Shopify stores, connecting one and letting it go. Shopify, the sealer and the
 * relay are ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class StoresService extends Context.Service<StoresService, {
  readonly list: Effect.Effect<ReadonlyArray<StoreView>, Forbidden, R>
  readonly beginConnect: (
    input: BeginConnect,
    redirectUri: string
  ) => Effect.Effect<{ readonly authorizeUrl: string }, Forbidden | ShopifyUnavailable | ShopNotFound, R>
  readonly callback: (
    query: Readonly<Record<string, string>>
  ) => Effect.Effect<Connect.Connected, ConnectFailed | StoreConnectedElsewhere, R>
  readonly disconnect: (id: string) => Effect.Effect<ReadonlyArray<StoreView>, Forbidden | NotFound, R>
}>()("modules/StoresService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    StoresService,
    Effect.gen(function*() {
      const shopify = yield* ShopifyAdmin
      const sealer = yield* Sealer
      const relay = yield* Relay
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(ShopifyAdmin, shopify),
          Effect.provideService(Sealer, sealer),
          Effect.provideService(Relay, relay),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: run(Stores.list()),
        beginConnect: (input, redirectUri) => run(Connect.beginConnect(input, redirectUri)),
        callback: (query) => run(Connect.callback(query)),
        disconnect: (id) => run(Stores.disconnect(id))
      }
    })
  )
}

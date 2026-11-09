import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { Sealer } from "../shared/domain/Sealer.ts"
import type { MarketingConnectFailed, SyncInput, SyncResult } from "./domain/Marketing.ts"
import type { Klaviyo, KlaviyoList } from "./domain/Ports.ts"
import * as K from "./use-cases/klaviyo.ts"

type R = Db | CurrentPrincipal | Klaviyo | Sealer

/**
 * The marketing slice (M7.5): the workspace's Klaviyo account, and customers sent to its lists.
 *
 * @effect-expect-leaking Db CurrentPrincipal Klaviyo Sealer Relay
 */
export class MarketingService extends Context.Service<MarketingService, {
  readonly status: Effect.Effect<{ readonly configured: boolean; readonly account: string | null }, Forbidden, R>
  readonly beginConnect: (
    returnPath: string,
    redirectUri: string
  ) => Effect.Effect<{ readonly authorizeUrl: string }, Forbidden | Conflict, R>
  readonly callback: (
    query: Readonly<Record<string, string>>,
    redirectUri: string
  ) => Effect.Effect<{ readonly returnPath: string; readonly account: string }, MarketingConnectFailed, R>
  readonly disconnect: Effect.Effect<void, Forbidden, R>
  readonly lists: Effect.Effect<ReadonlyArray<KlaviyoList>, Forbidden | Conflict, R>
  readonly sync: (input: typeof SyncInput.Type) => Effect.Effect<SyncResult, Forbidden | Conflict, R | Relay>
}>()("modules/MarketingService") {
  static readonly layer = Layer.succeed(MarketingService, {
    status: K.status().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    beginConnect: (returnPath, redirectUri) =>
      K.beginConnect(returnPath, redirectUri).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    callback: (query, redirectUri) =>
      K.callback(query, redirectUri).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    disconnect: K.disconnect().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    lists: K.lists().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    sync: (input) => K.sync(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

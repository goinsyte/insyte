import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  AppDetail,
  Catalog,
  FeedbackCategory,
  InstallResult,
  InstallView,
  ScopesChange,
  UninstallResult
} from "./domain/Marketplace.ts"
import type { AppKeys } from "./domain/Ports.ts"
import * as M from "./use-cases/marketplace.ts"

type R = Db | CurrentPrincipal
type Installs = ReadonlyArray<InstallView>

/**
 * The Marketplace slice (M17 step 3): the catalogue in code, a workspace's installs, rule-based recommendations,
 * scopes, and feedback. A recipe app's key is the developer slice's, reached through `AppKeys`.
 *
 * @effect-expect-leaking Db CurrentPrincipal AppKeys
 */
export class MarketplaceService extends Context.Service<MarketplaceService, {
  readonly catalog: Effect.Effect<Catalog>
  readonly installs: Effect.Effect<Installs, never, R>
  readonly get: (appId: string) => Effect.Effect<AppDetail, NotFound, R>
  readonly recommended: Effect.Effect<ReadonlyArray<string>, never, R>
  readonly install: (
    appId: string
  ) => Effect.Effect<InstallResult, Forbidden | Invalid | NotFound | Conflict, R | AppKeys>
  readonly uninstall: (appId: string) => Effect.Effect<UninstallResult, Forbidden | NotFound | Conflict, R | AppKeys>
  readonly setScopes: (input: {
    readonly appId: string
    readonly revoked: ReadonlyArray<string>
  }) => Effect.Effect<ScopesChange, Forbidden | Invalid | NotFound | Conflict, R | AppKeys>
  readonly open: (appId: string) => Effect.Effect<InstallView, NotFound, R>
  readonly feedback: (input: {
    readonly category: FeedbackCategory
    readonly message: string
  }) => Effect.Effect<void, Invalid, R>
}>()("modules/MarketplaceService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(MarketplaceService, {
    catalog: M.catalog(),
    installs: M.installs().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (appId) => M.get(appId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    recommended: M.recommended().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    install: (appId) => M.install(appId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    uninstall: (appId) => M.uninstall(appId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setScopes: (input) => M.setScopes(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    open: (appId) => M.open(appId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    feedback: (input) => M.feedback(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

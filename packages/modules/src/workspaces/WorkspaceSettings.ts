import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  Regional,
  SaveAccount,
  SaveRegional,
  SetAlerts,
  SetRetention,
  WorkspaceAccount
} from "./domain/Settings.ts"
import { getAccount } from "./use-cases/account.ts"
import { getRegional } from "./use-cases/regional.ts"
import { saveAccount } from "./use-cases/save-account.ts"
import { saveRegional } from "./use-cases/save-regional.ts"
import { setAlerts } from "./use-cases/set-alerts.ts"
import { setRetention } from "./use-cases/set-retention.ts"

type R = Db | CurrentPrincipal

/**
 * The workspace's own settings (M3.1): Instellingen → Account and Regio, read and written as the member, on the
 * workspace's row. Each write answers the settings as they now stand.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class WorkspaceSettings extends Context.Service<WorkspaceSettings, {
  readonly account: Effect.Effect<WorkspaceAccount, Forbidden, R>
  readonly saveAccount: (input: SaveAccount) => Effect.Effect<WorkspaceAccount, Forbidden | Invalid, R>
  readonly setAlerts: (input: SetAlerts) => Effect.Effect<WorkspaceAccount, Forbidden | Invalid, R>
  readonly setRetention: (input: SetRetention) => Effect.Effect<WorkspaceAccount, Forbidden | Invalid, R>
  readonly regional: Effect.Effect<Regional, Forbidden, R>
  readonly saveRegional: (input: SaveRegional) => Effect.Effect<Regional, Forbidden | Invalid, R>
}>()("modules/WorkspaceSettings") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(WorkspaceSettings, {
    account: getAccount().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    saveAccount: (input) => saveAccount(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setAlerts: (input) => setAlerts(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setRetention: (input) => setRetention(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    regional: getRegional().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    saveRegional: (input) => saveRegional(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

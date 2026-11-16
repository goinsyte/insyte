import { Db } from "@insyte/database/Db"
import type { Forbidden } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  AgentDay,
  AutoNotAllowedOnChannel,
  ChannelAgentSaved,
  ChannelAgentView,
  CustomerAgentSettingsInput,
  HoursInvalid
} from "./domain/ChannelAgent.ts"
import * as Settings from "./use-cases/settings.ts"

/*
 * Klantagent (M15 step 8; api.md §2.25): the customer agent's settings, read by the team and saved with Instellingen
 * Beheren (and `ai.autonomy` where a save lets it say more by itself), and its day. The test chat and the agent at work
 * need the model and the chat, so they are the platform's, loaded when used (`apps/api/src/platform/CustomerAgent.ts`).
 * A database that does not answer is a defect, as everywhere.
 */

type R = Db | CurrentPrincipal

/** @effect-expect-leaking Db CurrentPrincipal */
export class ChannelAgentService extends Context.Service<ChannelAgentService, {
  readonly get: Effect.Effect<ChannelAgentView, Forbidden, R>
  /** The settings for a key (`/v1`, MCP): Klantenservice · Bekijken. */
  readonly getForKey: Effect.Effect<ChannelAgentView, Forbidden, R>
  readonly set: (
    input: CustomerAgentSettingsInput
  ) => Effect.Effect<ChannelAgentSaved, Forbidden | AutoNotAllowedOnChannel | HoursInvalid, R>
  readonly today: Effect.Effect<AgentDay, Forbidden, R>
}>()("modules/ChannelAgentService") {
  static readonly layer = Layer.succeed(ChannelAgentService, {
    get: Effect.flatMap(Effect.service(Db), (db) => db.scoped(Settings.get)).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die)
    ),
    getForKey: Effect.flatMap(Effect.service(Db), (db) => db.scoped(Settings.getForKey)).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die)
    ),
    set: (input) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Settings.set(sql, input))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    today: Effect.flatMap(Effect.service(Db), (db) => db.scoped(Settings.today)).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die)
    )
  })
}

/** The undo of a save (`customer_agent.restore`), for the Undo registry. */
export const restore = Settings.restore
export const RESTORE = Settings.RESTORE

import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { FileStore } from "../shared/domain/Documents.ts"
import type {
  CountRetention,
  ErasingChange,
  GetSection,
  LinkUsage,
  NotCounted,
  RetentionCount,
  SaveSection,
  SectionChange,
  SetErasing,
  SettingsSection,
  StatusCounts,
  UploadedLogo,
  UploadLogo
} from "./domain/Settings.ts"
import { linkUsage, statusCounts, uploadLogo } from "./use-cases/reads.ts"
import { count, setErasing } from "./use-cases/retention.ts"
import { get, save } from "./use-cases/sections.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/**
 * The settings-depth slice (M17 track 1, step 20.1b): the workspace's settings sections, Verzending's counts,
 * Sjablonen' link usage, Huisstijl's logo and retention's count and switch, as the request's principal. Not reachable
 * by an API key (`settings` is `api: false`).
 *
 * @effect-expect-leaking Db CurrentPrincipal FileStore
 */
export class SettingsDepth extends Context.Service<SettingsDepth, {
  readonly get: (input: GetSection) => Effect.Effect<SettingsSection, Forbidden, R>
  readonly save: (input: SaveSection) => Effect.Effect<SectionChange, Forbidden | Invalid | Conflict, R>
  readonly statusCounts: Effect.Effect<StatusCounts, Forbidden, R>
  readonly linkUsage: Effect.Effect<LinkUsage, Forbidden, R>
  readonly uploadLogo: (input: UploadLogo) => Effect.Effect<UploadedLogo, Forbidden | Invalid, R | FileStore>
  readonly count: (input: CountRetention) => Effect.Effect<RetentionCount, Forbidden | Invalid, R>
  readonly setErasing: (input: SetErasing) => Effect.Effect<ErasingChange, Forbidden | NotCounted, R>
}>()("modules/SettingsDepth") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(SettingsDepth, {
    get: (input) => run(get(input)),
    save: (input) => run(save(input)),
    statusCounts: run(statusCounts()),
    linkUsage: run(linkUsage()),
    uploadLogo: (input) => run(uploadLogo(input)),
    count: (input) => run(count(input)),
    setErasing: (input) => run(setErasing(input))
  })
}

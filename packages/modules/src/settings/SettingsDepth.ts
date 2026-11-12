import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { FileStore } from "../shared/domain/Documents.ts"
import type {
  SaveSenders,
  SendersChange,
  SendingDomains,
  SendingDomainState,
  SetUpDomain
} from "./domain/SendingDomain.ts"
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
import * as SendingDomain from "./use-cases/sending-domain.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/**
 * The settings-depth slice (M17 track 1, steps 20.1b and 20.1c): the workspace's settings sections, Verzending's
 * counts, Sjablonen' link usage, Huisstijl's logo, retention's count and switch, and E-mail en domein's sending domain,
 * as the request's principal. Not reachable by an API key (`settings` is `api: false`).
 *
 * @effect-expect-leaking Db CurrentPrincipal FileStore SendingDomains
 */
export class SettingsDepth extends Context.Service<SettingsDepth, {
  readonly get: (input: GetSection) => Effect.Effect<SettingsSection, Forbidden, R>
  readonly save: (input: SaveSection) => Effect.Effect<SectionChange, Forbidden | Invalid | Conflict, R>
  readonly statusCounts: Effect.Effect<StatusCounts, Forbidden, R>
  readonly linkUsage: Effect.Effect<LinkUsage, Forbidden, R>
  readonly uploadLogo: (input: UploadLogo) => Effect.Effect<UploadedLogo, Forbidden | Invalid, R | FileStore>
  readonly count: (input: CountRetention) => Effect.Effect<RetentionCount, Forbidden | Invalid, R>
  readonly setErasing: (input: SetErasing) => Effect.Effect<ErasingChange, Forbidden | NotCounted, R>
  readonly domain: Effect.Effect<SendingDomainState, Forbidden, R | SendingDomains>
  readonly verifyDomain: Effect.Effect<SendingDomainState, Forbidden, R | SendingDomains>
  readonly setUpDomain: (
    input: SetUpDomain
  ) => Effect.Effect<SendingDomainState, Forbidden | Invalid, R | SendingDomains>
  readonly removeDomain: Effect.Effect<SendingDomainState, Forbidden, R | SendingDomains>
  readonly saveSenders: (
    input: SaveSenders
  ) => Effect.Effect<SendersChange, Forbidden | Invalid | Conflict, R | SendingDomains>
}>()("modules/SettingsDepth") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(SettingsDepth, {
    get: (input) => run(get(input)),
    save: (input) => run(save(input)),
    statusCounts: run(statusCounts()),
    linkUsage: run(linkUsage()),
    uploadLogo: (input) => run(uploadLogo(input)),
    count: (input) => run(count(input)),
    setErasing: (input) => run(setErasing(input)),
    domain: run(SendingDomain.get()),
    verifyDomain: run(SendingDomain.verify()),
    setUpDomain: (input) => run(SendingDomain.setUp(input)),
    removeDomain: run(SendingDomain.remove()),
    saveSenders: (input) => run(SendingDomain.saveSenders(input))
  })
}

import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { FileStore } from "../shared/domain/Documents.ts"
import { Relay } from "../shared/domain/Outbox.ts"
import type {
  ExportSchedule,
  Inventory,
  PrivacyRequests,
  RequestAccess,
  RequestDeletion,
  RequestErasure,
  RequestMade,
  SetExportSchedule,
  ShopperNotFound
} from "./domain/Privacy.ts"
import { cancelDeletion, requestDeletion } from "./use-cases/deletion.ts"
import { requestExport, setSchedule } from "./use-cases/exports.ts"
import { inventory, requests } from "./use-cases/reads.ts"
import { requestAccess, requestErasure } from "./use-cases/shoppers.ts"

export {
  deletionDue,
  deletionsStranded,
  purgeWorkspace,
  restartDeletion,
  revokeConnections
} from "./use-cases/deletion.ts"
export {
  type Cursor,
  dueExports,
  EXCLUDED,
  expiredFiles,
  EXPORTED,
  exportPage,
  failExport,
  finishExport,
  type Paged,
  planExport,
  removeFiles,
  scheduleExport,
  type Stream
} from "./use-cases/exports.ts"
export { mayDownload } from "./use-cases/reads.ts"

type R = Db | CurrentPrincipal

/**
 * Je gegevens (M17 step 5, PLAN 48): what the workspace holds and where, the export and its schedule, a shopper's
 * access and erasure requests, and deleting the workspace after a waiting period. The runs that make an export and
 * wait out a deletion are the platform's (`PrivacyRuns`); their steps are exported beside the service.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class PrivacyService extends Context.Service<PrivacyService, {
  readonly inventory: Effect.Effect<Inventory, Forbidden, R>
  readonly requests: Effect.Effect<PrivacyRequests, Forbidden, R>
  readonly setExportSchedule: (
    input: SetExportSchedule
  ) => Effect.Effect<{ readonly schedule: ExportSchedule }, Forbidden, R>
  readonly requestExport: Effect.Effect<RequestMade, Forbidden, R>
  readonly requestAccess: (
    input: RequestAccess
  ) => Effect.Effect<RequestMade, Forbidden | NotFound | ShopperNotFound, R>
  readonly requestErasure: (input: RequestErasure) => Effect.Effect<RequestMade, Forbidden | ShopperNotFound, R>
  readonly requestDeletion: (input: RequestDeletion) => Effect.Effect<RequestMade, Forbidden | Invalid | Conflict, R>
  readonly cancelDeletion: Effect.Effect<RequestMade, Forbidden | Conflict, R>
}>()("modules/PrivacyService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    PrivacyService,
    Effect.gen(function*() {
      const relay = yield* Relay
      const files = yield* FileStore
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(FileStore, files),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        inventory: run(inventory()),
        requests: run(requests()),
        setExportSchedule: (input) => run(setSchedule(input)),
        requestExport: run(requestExport()),
        requestAccess: (input) => run(requestAccess(input)),
        requestErasure: (input) => run(requestErasure(input)),
        requestDeletion: (input) => run(requestDeletion(input)),
        cancelDeletion: run(cancelDeletion())
      }
    })
  )
}

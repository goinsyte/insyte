import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import {
  deletionsStranded,
  dueExports,
  expiredFiles,
  removeFiles,
  restartDeletion,
  scheduleExport
} from "@insyte/modules/privacy/Privacy"
import { Effect } from "effect"

/*
 * Je gegevens' daily sweep (M17 step 5), across workspaces, each one's work in its own scope:
 *
 * - every workspace whose weekly or monthly export is due gets one, made by its run like an export asked for by hand;
 *   the owner hears when it is ready;
 * - every export and shopper's package past its 7 days is removed from the bucket, and what a failed or stalled run
 *   left behind with it;
 * - every deletion an hour past its time and not done is started again, as a new attempt.
 *
 * One workspace's failure is logged and does not stop the others.
 */
const each = <A, E, R>(label: string, workspaceId: WorkspaceId, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId }),
    Effect.catchCause((cause) => Effect.logWarning(`privacy sweep: ${label} failed`, { workspaceId, cause }))
  )

export const privacyExportSweep = Effect.fn("Privacy.sweep")(
  function*() {
    for (const workspaceId of yield* dueExports) yield* each("scheduled export", workspaceId, scheduleExport())
    for (const row of yield* expiredFiles) {
      yield* each("expired files", row.workspaceId, removeFiles(row.requestId))
    }
    for (const row of yield* deletionsStranded) {
      yield* each("stranded deletion", row.workspaceId, restartDeletion(row.requestId))
    }
  },
  Effect.orDie
)

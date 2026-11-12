import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { dueWorkspaces, eraseWorkspace } from "@insyte/modules/settings/use-cases/retention"
import { Effect } from "effect"

/*
 * The nightly erase (M17 step 20.1b; domain.md §12.29), on the fifteen-minute cron: each workspace with erasing on, once
 * a night at 03:00 in its timezone (`retention_due_workspaces`, 0061), as `system`. One workspace that fails is a defect
 * for that one only: the next is still erased, and the failed one is due again on the next quarter of that hour.
 */

/** One workspace's erase now, as `system`; null when its erasing went off. */
export const retentionWorkspace = (workspaceId: WorkspaceId) =>
  eraseWorkspace().pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))

export const retentionSweep = Effect.fn("Retention.sweep")(function*(at: Date) {
  for (const workspaceId of yield* dueWorkspaces(at)) {
    yield* retentionWorkspace(workspaceId as WorkspaceId).pipe(Effect.catchCause(Effect.logError))
  }
}, Effect.orDie)

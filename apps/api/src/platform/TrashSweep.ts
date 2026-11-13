import { CurrentWorkspace } from "@insyte/domain/Principal"
import { dueWorkspaces, sweepWorkspace } from "@insyte/modules/trash/use-cases/trash"
import { Effect } from "effect"
import { TrashKindsLive } from "./links/TrashKinds.ts"

/*
 * The Prullenbak's daily sweep (M17 step 20.1a; domain.md §16.1): in each workspace holding an item past its 30 days,
 * those items purged as `system`, through each kind's own purge, an audit line each. A workspace with more than one
 * turn's worth keeps the rest for the next day.
 */
export const trashSweep = Effect.fn("Trash.sweep")(
  function*() {
    for (const workspaceId of yield* dueWorkspaces) {
      yield* sweepWorkspace().pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))
    }
  },
  Effect.provide(TrashKindsLive),
  Effect.orDie
)

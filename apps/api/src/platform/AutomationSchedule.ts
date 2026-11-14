import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { AutomationRuns } from "@insyte/modules/automations/domain/Ports"
import { sweepWorkspaces } from "@insyte/modules/facts/Facts"
import { Effect } from "effect"
import { withEngine } from "./AutomationEngine.ts"

/*
 * Every hour (M12 step 3): "Op een vast moment". In each workspace with a store, its scheduled flows due at this hour in
 * its timezone start a run per record the moment picks (`startScheduled`), each its own Workflow. One workspace that
 * fails is logged and the others go on; its records still come due on the next tick, as each tick looks back.
 */
export const scheduleSweep = Effect.fn("Automations.scheduleSweep")(function*(at: Date) {
  const starter = yield* AutomationRuns
  for (const workspaceId of yield* sweepWorkspaces(true)) {
    yield* withEngine((e) => e.startScheduled(at)).pipe(
      Effect.flatMap((runs) =>
        Effect.forEach(runs, (runId) => starter.start({ workspaceId, runId }), { discard: true })
      ),
      Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
      Effect.catchCause((cause) =>
        Effect.logWarning("automations: a workspace's schedule did not run", { workspaceId, cause })
      )
    )
  }
}, Effect.orDie)

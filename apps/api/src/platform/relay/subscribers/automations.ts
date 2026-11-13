import { TRIGGER_EVENTS } from "@insyte/domain/automations/Engine"
import { AutomationRuns } from "@insyte/modules/automations/domain/Ports"
import { startRuns } from "@insyte/modules/automations/use-cases/engine"
import { Effect } from "effect"
import { onEach, subscriber } from "../Subscriber.ts"

export const Automations = subscriber(
  "automations",
  // A trigger's event (M12 step 3): a run per active flow and record, each its own Workflow, named by the run.
  onEach([...TRIGGER_EVENTS], (id, event, sql) =>
    Effect.gen(function*() {
      const runs = yield* startRuns(sql, id, event).pipe(Effect.orDie)
      const starter = yield* AutomationRuns
      for (const runId of runs) yield* starter.start({ workspaceId: event.workspaceId, runId })
    }))
)

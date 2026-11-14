import { TRIGGER_EVENTS } from "@insyte/domain/automations/Engine"
import { AutomationRuns } from "@insyte/modules/automations/domain/Ports"
import { Effect } from "effect"
import { withEngine } from "../../AutomationEngine.ts"
import { onEach, subscriber } from "../Subscriber.ts"

export const Automations = subscriber(
  "automations",
  // A trigger's event (M12 step 3): a run per active flow and record, each its own Workflow, named by the run.
  onEach([...TRIGGER_EVENTS], (id, event, sql) =>
    Effect.gen(function*() {
      // The engine is loaded on the first trigger event an isolate sees, not when the Worker starts.
      const runs = yield* withEngine((e) => e.startRuns(sql, id, event)).pipe(Effect.orDie)
      const starter = yield* AutomationRuns
      for (const runId of runs) yield* starter.start({ workspaceId: event.workspaceId, runId })
    }))
)

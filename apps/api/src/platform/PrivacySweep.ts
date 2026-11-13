import { CurrentWorkspace } from "@insyte/domain/Principal"
import { dueExports, scheduleExport } from "@insyte/modules/privacy/Privacy"
import { Effect } from "effect"

/*
 * Scheduled exports (M17 step 5): once a day, every workspace whose weekly or monthly export is due gets one, made
 * by its run like an export asked for by hand; the owner hears when it is ready.
 */
export const privacyExportSweep = Effect.fn("Privacy.exportSweep")(
  function*() {
    for (const workspaceId of yield* dueExports) {
      yield* scheduleExport().pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))
    }
  },
  Effect.orDie
)

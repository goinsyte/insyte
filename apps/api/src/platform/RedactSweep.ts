import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { redactsDue, retryRedact } from "@insyte/modules/stores/use-cases/webhooks"
import { Effect } from "effect"

/*
 * Shopify's erasures that did not finish (0106), on the hour: each failed one, or one stalled a quarter of an hour, is
 * tried again in its workspace until it is done or its 30 days have passed (then `/api/health/deep` shows it overdue).
 * One that fails again is an error in the log, with the columns that held the shopper; one workspace's failure does not
 * stop the others. Loaded by the cron when it runs (`transports/jobs/Cron.ts`), not when the jobs Worker starts.
 */
export const redactSweep = Effect.fn("Privacy.redactSweep")(
  function*() {
    let done = 0
    for (const row of yield* redactsDue) {
      const finished = yield* retryRedact(row.requestId).pipe(
        Effect.provideService(CurrentWorkspace, { id: row.workspaceId as WorkspaceId }),
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logError("privacy sweep: a shopper's erasure could not be tried again", {
              workspaceId: row.workspaceId,
              requestId: row.requestId,
              cause
            }),
            false
          )
        )
      )
      if (finished) done++
    }
    return { done }
  },
  Effect.orDie
)

import { purgeIn as purgeTickets, putBack as putBackTickets } from "@insyte/modules/tickets/use-cases/commands"
import { TrashKinds } from "@insyte/modules/trash/TrashKinds"
import { Effect, Layer } from "effect"

/* The Prullenbak → each kind's own put-back and purge (M17 step 20.1a). */

/** The Prullenbak's kinds, also for the daily sweep (`TrashSweep.ts`). */
export const TrashKindsLive = Layer.succeed(TrashKinds, {
  ticket: {
    restore: (ids) => Effect.map(putBackTickets({ ids }), (change) => (change.undo === null ? [] : [change.undo])),
    purge: purgeTickets
  }
})

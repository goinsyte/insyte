import { PendingEvents, Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { withRequestDb } from "./RequestDb.ts"

/**
 * `withRequestDb` for a Workflow's step, which answers no request: the events its writes recorded (`PendingEvents`)
 * are kicked once `effect` has ended, so its transactions have committed, as `WithDbLive` does for an RPC. A change a
 * step made (a forward's work in the supplier's portal, a flow's action) reaches the tabs now, not at the next sweep.
 * Kicked inside the step: a step that completed is not run again on a replay, and one that failed after committing a
 * transaction of its own (a leg sent before the next could not be reached) is kicked too; an event whose transaction
 * rolled back is no row, which the relay passes over.
 */
export const withStepDb = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const pending: Array<string> = []
    return withRequestDb(effect).pipe(
      Effect.provideService(PendingEvents, { add: (id) => void pending.push(id) }),
      Effect.ensuring(Effect.suspend(() => Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(pending))))
    )
  })

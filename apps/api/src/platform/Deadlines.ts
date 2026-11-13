import { reminderWorkspaces, remindWorkspace } from "@insyte/modules/chargebacks/Chargebacks"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"

/*
 * Every hour (M13 step 3): the chargeback deadline reminders that have come, five days, two days and six hours before
 * each open case's deadline, in each workspace that has a deadline within five days. Each reminder is an outbox event,
 * kicked onto the relay, whose notifications sink tells the team.
 */
export const deadlineSweep = Effect.fn("Chargebacks.deadlineSweep")(function*(at: Date) {
  const relay = yield* Relay
  for (const workspaceId of yield* reminderWorkspaces) {
    yield* relay.kick(yield* remindWorkspace(workspaceId, at))
  }
}, Effect.orDie)

import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"

/**
 * The order commands also tell the outbox: the relay is the Worker's, taken once when a slice's tools are built, and
 * given to each command a tool runs.
 */
export const kicker = Effect.map(
  Effect.service(Relay),
  (relay) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, Relay, relay)
)

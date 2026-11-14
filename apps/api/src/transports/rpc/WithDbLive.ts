import { WithDb } from "@insyte/api/rpc/WithDb"
import { Connect } from "@insyte/database/Connect"
import { PendingEvents, Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect, Layer } from "effect"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * `Db` to every RPC handler, over this request's connection (16 §4). The events its writes recorded (`PendingEvents`)
 * are kicked once the handler has answered, so its transactions have committed: a change reaches the other tabs now,
 * not at the next sweep. A handler that failed is kicked too: a step it committed before the failure (a model call
 * refused for its budget says so in a transaction of its own) is delivered now, and an event whose transaction rolled
 * back is no row, which the relay passes over.
 */
export const WithDbLive = Layer.effect(
  WithDb,
  Effect.gen(function*() {
    const connect = yield* Connect
    const relay = yield* Relay
    return WithDb.of((effect) =>
      Effect.suspend(() => {
        const pending: Array<string> = []
        return withRequestDb(effect).pipe(
          Effect.provideService(Connect, connect),
          Effect.provideService(PendingEvents, { add: (id) => void pending.push(id) }),
          Effect.ensuring(Effect.suspend(() => relay.kick(pending)))
        )
      })
    )
  })
)

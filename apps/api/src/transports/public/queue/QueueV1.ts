import { QueueService } from "@insyte/modules/queue/Queue"
import { Context, Effect, Layer } from "effect"
import { queuePageV1 } from "./present.ts"

/* What needs the team on Start (M19.2, M19.3), narrowed to what the key's scopes may read. */

const make = Effect.gen(function*() {
  const queue = yield* QueueService
  return {
    queue: (tab?: "needs_you" | "drawn" | "all") =>
      queue.list(tab === undefined ? {} : { tab }).pipe(Effect.map(queuePageV1))
  }
})

/**
 * The queue, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class QueueV1 extends Context.Service<QueueV1, Effect.Success<typeof make>>()("api-worker/QueueV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(QueueService.layer))
}

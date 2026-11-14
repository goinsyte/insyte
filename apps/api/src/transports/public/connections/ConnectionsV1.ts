import { StoresService } from "@insyte/modules/stores/Stores"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { healthV1 } from "./present.ts"

/* Sync health (M17 step 6, M19.2, M19.3): every store's connection with its incidents, as the key may read it. */

const make = Effect.gen(function*() {
  const stores = yield* StoresService
  return {
    health: () => stores.health.pipe(Effect.map(healthV1), Effect.catchTag("Forbidden", scopeMissing))
  }
})

/**
 * Sync health, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class ConnectionsV1 extends Context.Service<ConnectionsV1, Effect.Success<typeof make>>()(
  "api-worker/ConnectionsV1"
) {
  static readonly layer = Layer.effect(this, make)
}

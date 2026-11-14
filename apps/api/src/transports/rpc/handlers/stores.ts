import { StoresRpcs } from "@insyte/api/rpc/StoresRpcs"
import { StoresService } from "@insyte/modules/stores/Stores"
import { Config, Effect } from "effect"
import { aiMode } from "../../../platform/AiSettings.ts"

/** Where Shopify sends the operator back: the console's origin, which forwards `/api/*` here. */
export const CALLBACK_PATH = "/api/connect/shopify/callback"

export const StoresHandlers = StoresRpcs.toLayer(Effect.gen(function*() {
  const stores = yield* StoresService
  const origin = yield* Config.String("CONSOLE_ORIGIN")
  return StoresRpcs.of({
    "Stores.list": () => stores.list,
    "Stores.beginConnect": (input) => stores.beginConnect(input, `${origin}${CALLBACK_PATH}`),
    "Stores.syncStatus": ({ id }) => stores.syncStatus(id),
    "Connections.health": () => stores.health,
    // Insyte AI's row reads the stage's settings only, as `Drafts.status` does: nothing of the AI slice loads.
    "Connections.list": () => aiMode.pipe(Effect.orDie, Effect.flatMap((mode) => stores.connections(mode !== "off"))),
    "Stores.disconnect": ({ id }) => stores.disconnect(id)
  })
}))

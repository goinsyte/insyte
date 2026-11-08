import { StoresRpcs } from "@insyte/api/rpc/StoresRpcs"
import { StoresService } from "@insyte/modules/stores/Stores"
import { Config, Effect } from "effect"

/** Where Shopify sends the operator back: the console's origin, which forwards `/api/*` here. */
export const CALLBACK_PATH = "/api/connect/shopify/callback"

export const StoresHandlers = StoresRpcs.toLayer(Effect.gen(function*() {
  const stores = yield* StoresService
  const origin = yield* Config.String("CONSOLE_ORIGIN")
  return StoresRpcs.of({
    "Stores.list": () => stores.list,
    "Stores.beginConnect": (input) => stores.beginConnect(input, `${origin}${CALLBACK_PATH}`),
    "Stores.syncStatus": ({ id }) => stores.syncStatus(id),
    "Stores.disconnect": ({ id }) => stores.disconnect(id)
  })
}))

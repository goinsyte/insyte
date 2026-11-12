import { MarketplaceRpcs } from "@insyte/api/rpc/MarketplaceRpcs"
import { MarketplaceService } from "@insyte/modules/marketplace/Marketplace"
import { Effect } from "effect"

export const MarketplaceHandlers = MarketplaceRpcs.toLayer(Effect.gen(function*() {
  const marketplace = yield* MarketplaceService
  return MarketplaceRpcs.of({
    "Marketplace.catalog": () => marketplace.catalog,
    "Marketplace.installs": () => marketplace.installs,
    "Marketplace.get": ({ appId }) => marketplace.get(appId),
    "Marketplace.recommended": () => marketplace.recommended,
    "Marketplace.install": ({ appId }) => marketplace.install(appId),
    "Marketplace.uninstall": ({ appId }) => marketplace.uninstall(appId),
    "Marketplace.setScopes": (input) => marketplace.setScopes(input),
    "Marketplace.open": ({ appId }) => marketplace.open(appId),
    "Marketplace.feedback": (input) => marketplace.feedback(input)
  })
}))

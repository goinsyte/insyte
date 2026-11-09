import { MarketingRpcs } from "@insyte/api/rpc/MarketingRpcs"
import { MarketingService } from "@insyte/modules/marketing/Marketing"
import { Config, Effect } from "effect"

/** Where Klaviyo sends the operator back: the console's origin, which forwards `/api/*` here. */
export const KLAVIYO_CALLBACK_PATH = "/api/connect/klaviyo/callback"

export const MarketingHandlers = MarketingRpcs.toLayer(Effect.gen(function*() {
  const marketing = yield* MarketingService
  const origin = yield* Config.String("CONSOLE_ORIGIN")
  return MarketingRpcs.of({
    "Marketing.status": () => marketing.status,
    "Marketing.beginConnect": ({ returnPath }) =>
      marketing.beginConnect(returnPath, `${origin}${KLAVIYO_CALLBACK_PATH}`),
    "Marketing.disconnect": () => marketing.disconnect,
    "Customers.marketingLists": () => marketing.lists,
    "Customers.syncToMarketing": (input) => marketing.sync(input)
  })
}))

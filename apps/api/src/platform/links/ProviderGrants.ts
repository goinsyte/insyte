import type { Klaviyo } from "@insyte/modules/marketing/domain/Ports"
import { releaseKlaviyo } from "@insyte/modules/marketing/use-cases/klaviyo"
import type { Slack } from "@insyte/modules/notifications/domain/Ports"
import { releaseSlack } from "@insyte/modules/notifications/use-cases/slack"
import { ProviderGrants, type Released } from "@insyte/modules/privacy/Grants"
import type { Sealer } from "@insyte/modules/shared/domain/Sealer"
import type { ConnectionGate, ShopifyAdmin } from "@insyte/modules/stores/domain/Ports"
import { releaseStores } from "@insyte/modules/stores/use-cases/release"
import { Effect, Layer } from "effect"

/**
 * A workspace's deletion → each provider's slice giving its grant back (M17 step 5): the stores' Shopify app, the
 * marketing slice's Klaviyo, the notifications slice's Slack. One that fails is logged and counted as none: the
 * tokens go with the workspace either way.
 */
export const ProviderGrantsLive = Layer.effect(
  ProviderGrants,
  Effect.gen(function*() {
    const services = yield* Effect.context<Klaviyo | Slack | Sealer | ShopifyAdmin | ConnectionGate>()
    const one = <E, R>(provider: Released["provider"], release: Effect.Effect<number, E, R>) =>
      release.pipe(
        Effect.map((count): Released => ({ provider, count })),
        Effect.catchCause((cause) =>
          Effect.as(Effect.logWarning("a provider's grant was not given back", { provider, cause }), {
            provider,
            count: 0
          })
        )
      )
    return ProviderGrants.of({
      release: Effect.all([
        one("shopify", releaseStores()),
        one("klaviyo", releaseKlaviyo()),
        one("slack", releaseSlack())
      ]).pipe(Effect.provide(services))
    })
  })
)

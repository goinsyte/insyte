import { syncAdSpend } from "@insyte/modules/costs/Costs"
import { AdSpend, AdSpendUnavailable } from "@insyte/modules/costs/domain/Ports"
import { Effect, Layer } from "effect"

/*
 * Ad spend (M13 step 5): the Meta Marketing API and Google Ads, as the costs slice's port. Insyte has no app keys for
 * either yet, so this environment reads neither: `configured` says no, and an account cannot be connected, so the
 * daily sync visits nothing. Each provider becomes an adapter here, chosen by its keys, once they exist.
 */

export const AdSpendLive = Layer.succeed(AdSpend)(AdSpend.of({
  configured: () => false,
  read: ({ provider }) => Effect.fail(new AdSpendUnavailable({ provider, reason: "not_configured" }))
}))

/** Once a day (04:00 UTC, after the facts' nightly pass): every connected ad account's last days. */
export const adSpendSweep = Effect.fn("AdSpend.sweep")(function*() {
  const written = yield* syncAdSpend()
  if (written > 0) yield* Effect.logInfo("ad spend synced", { days: written })
})

import { Context, type Effect, Schema } from "effect"

/*
 * Ad spend as a port (M13 step 5; domain.md §10.1): what an ad account reports per day and campaign, read by the daily
 * sync into `ad_spend_day`. The Meta Marketing API (`ads_read`) and Google Ads each become an adapter once Insyte has
 * their app keys; until then the API Worker's adapter is `unconfigured`, an account cannot be connected, and an ad
 * line is typed. Nothing is ever made up in their place.
 */

export type AdProvider = "meta" | "google_ads"

export interface AdSpendDay {
  readonly day: string
  readonly campaignRef: string
  readonly channel: string | null
  readonly spendMinor: number
  readonly currency: string
}

/** The provider cannot be read here: no app keys in this environment, or the account refused or failed. */
export class AdSpendUnavailable extends Schema.TaggedError<AdSpendUnavailable>()("AdSpendUnavailable", {
  provider: Schema.String,
  reason: Schema.Literals(["not_configured", "not_connected", "unreachable"])
}) {}

export class AdSpend extends Context.Service<AdSpend, {
  /** Whether this environment can read the provider at all (its app keys are set). */
  readonly configured: (provider: AdProvider) => boolean
  /** One account's spend per day and campaign, both days included. */
  readonly read: (input: {
    readonly provider: AdProvider
    readonly connectionId: string
    readonly accountRef: string
    readonly from: string
    readonly to: string
  }) => Effect.Effect<ReadonlyArray<AdSpendDay>, AdSpendUnavailable>
}>()("costs/AdSpend") {}

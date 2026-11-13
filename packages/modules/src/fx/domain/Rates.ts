import { Context, type Effect, Schema } from "effect"

/*
 * The ECB's euro reference rates (§0.4, M10): published each working day around 16:00 CET, public and keyless. The
 * port names what Insyte reads of them, a run of days each with the euro's rate in every currency the ECB quotes; the
 * adapter is `@insyte/integrations-ecb`, with a recorded twin for the worker tests. What the rates are for is the fill's
 * (`use-cases/fill.ts`): `fx_rates`, which every conversion reads at the latest day on or before the one it converts.
 */

/** One day of the ECB's rates: 1 EUR = `rate` of `currency`, as the decimal the ECB wrote. */
export interface EcbDay {
  /** `YYYY-MM-DD`, the ECB's own day. */
  readonly day: string
  readonly rates: ReadonlyArray<{ readonly currency: string; readonly rate: string }>
}

export class RatesError extends Schema.TaggedError<RatesError>()("RatesError", {
  reason: Schema.String
}) {}

export class ReferenceRates extends Context.Service<ReferenceRates, {
  /** The ECB's last 90 days of rates (about 64 working days), newest first. */
  readonly recent: Effect.Effect<ReadonlyArray<EcbDay>, RatesError>
}>()("fx/ReferenceRates") {}

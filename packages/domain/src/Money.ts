import { Schema } from "effect"

export const Currency = Schema.Literals(["EUR", "USD", "GBP"])
export type Currency = typeof Currency.Type

/** Integer minor units. Never a float, anywhere. */
export const Money = Schema.Struct({
  minor: Schema.Int,
  currency: Currency
})
export type Money = typeof Money.Type

export const NonNegativeMoney = Money.check(
  Schema.makeFilter((m) => m.minor >= 0 || "Bedrag mag niet negatief zijn")
)

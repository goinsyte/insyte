/*
 * How many decimals an amount has in Insyte's minor units: none for the currencies without minor units, two for every
 * other one, the three-decimal currencies too (`toMinor` and `fromMinor` in the stores' mirror, the console's amounts).
 */

/** ISO 4217 currencies without minor units (Shopify's set); the rest have two. */
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF"
])

/** `EUR` → 2, `JPY` → 0: the decimals of one minor unit. */
export const minorDigits = (currency: string): 0 | 2 => ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2

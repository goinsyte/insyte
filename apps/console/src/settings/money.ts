/** Stripe's minor units as nl-NL writes them: "€ 299" for a whole amount, "€ 12,34" otherwise (Facturatie, onboarding). */
export const money = (minor: number, currency: string) =>
  (minor / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })

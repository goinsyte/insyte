import type { Currency } from "./types/domain";

/*
 * Fixed demo exchange rates, per US dollar. The stores sell in USD, EUR and GBP, so a figure that
 * adds them up has to pick one currency to say it in; Home's currency switch picks it. The rates
 * are stated wherever a converted figure is broken down, because a converted number is only
 * traceable if the rate is.
 */
export const RATES: Record<Currency, number> = { USD: 1, EUR: 0.92, GBP: 0.79 };

export function convert(amount: number, from: Currency, to: Currency): number {
	return (amount / RATES[from]) * RATES[to];
}

export const RATE_NOTE = `Omgerekend tegen vaste demokoersen: 1 USD = ${RATES.EUR.toLocaleString("nl-NL")} EUR = ${RATES.GBP.toLocaleString("nl-NL")} GBP.`;

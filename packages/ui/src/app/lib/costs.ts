import { HISTORY, type Channel } from "./analytics/history";
import { counts, MONTHS, type Month } from "./analytics/engine";

/*
 * Costs (PLAN 42): what it costs to run the shop, per month, so revenue can become net profit in
 * Analyse and in Rekenbladen.
 *
 * A line is one of four kinds. A fixed amount per month (the Shopify plan, salaries). An amount per
 * order (packaging). A share of revenue (payment fees, the purchase price at the supplier). Or ad
 * spend per month, which for a connected ad account is read from it and for the rest is typed in.
 * A typed amount always wins over a read one, and says so.
 */

export type CostKind = "fixed" | "per_order" | "percent" | "ads";
export type CostSource = "manual" | "meta" | "google-ads";

export type CostLine = {
	id: string;
	name: string;
	kind: CostKind;
	/** Fixed and ads: an amount per month. Typed amounts; a missing month falls back. */
	amounts: Partial<Record<Month, number>>;
	/** Per order: the amount; percent: the share of revenue, 0–100. */
	rate: number;
	source: CostSource;
	/** For ads: the channel whose revenue the spend is read against. */
	channel?: Channel;
};

export type CostsSeed = { lines: CostLine[] };

export const KIND_LABEL: Record<CostKind, string> = { fixed: "Vast per maand", per_order: "Per bestelling", percent: "Deel van de omzet", ads: "Advertenties" };

export const MONTH_IDS: ReadonlyArray<Month> = MONTHS.map((m) => m.id);
export const monthAbbr = (m: Month) => MONTHS.find((x) => x.id === m)!.abbr;
export const monthName = (m: Month) => MONTHS.find((x) => x.id === m)!.label;

const inMonth = (day: string, m: Month) => day.startsWith(m);

/** Revenue that counts, for a month, optionally for one channel. */
export function revenueOf(m: Month, channel?: Channel): number {
	let n = 0;
	for (const o of HISTORY.orders) if (inMonth(o.day, m) && counts(o) && (!channel || o.channel === channel)) n += o.total;
	return n;
}

export function ordersOf(m: Month): number {
	let n = 0;
	for (const o of HISTORY.orders) if (inMonth(o.day, m) && counts(o)) n++;
	return n;
}

export function refundedOf(m: Month): number {
	let n = 0;
	for (const o of HISTORY.orders) if (inMonth(o.day, m) && o.status === "refunded") n += o.total;
	return n;
}

export function disputedOf(m: Month): number {
	let n = 0;
	for (const d of HISTORY.disputes) if (inMonth(d.day, m)) n += d.amount;
	return n;
}

/* What a connected account reports: spend that returns its channel's revenue at a steady ROAS, with
   the month-to-month wobble a real account has. Deterministic, so a sheet reads the same twice. */
const ROAS: Partial<Record<Channel, number>> = { "Meta ads": 2.7, Google: 3.6 };
const wobble = (m: Month, ch: string) => {
	let h = 0;
	for (const c of `${m}${ch}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return 0.9 + ((h % 1000) / 1000) * 0.2;
};
export function reportedSpend(channel: Channel, m: Month): number {
	const roas = ROAS[channel];
	if (!roas) return 0;
	return Math.round((revenueOf(m, channel) / roas) * wobble(m, channel));
}

/** Whether a line's amount for a month was typed or read from the account. */
export const typed = (l: CostLine, m: Month) => l.amounts[m] !== undefined;

/** One line's cost in a month. `connected` says which ad accounts report their own spend. */
export function costOf(l: CostLine, m: Month, connected: ReadonlySet<string>): number {
	if (l.kind === "fixed") return l.amounts[m] ?? 0;
	if (l.kind === "per_order") return Math.round(l.rate * ordersOf(m) * 100) / 100;
	if (l.kind === "percent") return Math.round(((l.rate / 100) * revenueOf(m)) * 100) / 100;
	if (l.amounts[m] !== undefined) return l.amounts[m]!;
	return l.channel && l.source !== "manual" && connected.has(l.source) ? reportedSpend(l.channel, m) : 0;
}

export type MonthFigures = { revenue: number; orders: number; ads: number; other: number; costs: number; net: number; margin: number; roas: number };

export function figuresOf(lines: ReadonlyArray<CostLine>, m: Month, connected: ReadonlySet<string>): MonthFigures {
	const revenue = revenueOf(m);
	const ads = lines.filter((l) => l.kind === "ads").reduce((n, l) => n + costOf(l, m, connected), 0);
	const other = lines.filter((l) => l.kind !== "ads").reduce((n, l) => n + costOf(l, m, connected), 0);
	const costs = ads + other;
	const net = revenue - costs;
	return { revenue, orders: ordersOf(m), ads, other, costs, net, margin: revenue ? net / revenue : 0, roas: ads ? revenue / ads : 0 };
}

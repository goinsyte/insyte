import { convert } from "./money";
import type { Currency, Order } from "./types/domain";

/*
 * Revenue for Home: one window, one currency, and the window before it for the comparison. The
 * widget and its breakdown both read this, so the figure on the board and the figure the breakdown
 * explains are the same number by construction.
 *
 * The seed orders stop months before today, so a window ends at the latest order rather than at
 * the clock; "last 30 days" means the last 30 days the workspace has orders for.
 */

const DAY = 86_400_000;

export type RevenueWindow = {
	points: Array<{ label: string; value: number; orders: number }>;
	total: number;
	previous: number;
	/** Whole-percent change on the window before, or null when there was nothing before. */
	change: number | null;
	counted: Order[];
	excluded: { cancelled: Order[]; refunded: Order[] };
};

export function revenueWindow(orders: ReadonlyArray<Order>, days: number, currency: Currency): RevenueWindow {
	const end = orders.length === 0 ? Date.now() : Math.max(...orders.map((o) => Date.parse(o.created_at))) + DAY;
	const start = end - days * DAY;
	const inRange = (o: Order, from: number, to: number) => {
		const t = Date.parse(o.created_at);
		return t >= from && t < to;
	};
	const live = (o: Order) => o.status !== "cancelled" && o.status !== "refunded";
	const value = (o: Order) => convert(o.total, o.currency, currency);

	const windowed = orders.filter((o) => inRange(o, start, end));
	const counted = windowed.filter(live);
	const previous = orders.filter((o) => live(o) && inRange(o, start - days * DAY, start)).reduce((n, o) => n + value(o), 0);
	const total = counted.reduce((n, o) => n + value(o), 0);

	// Daily up to a month; weekly beyond, so the chart keeps a readable number of points.
	const step = days > 31 ? 7 * DAY : DAY;
	const buckets = Math.ceil((days * DAY) / step);
	const fmt = new Intl.DateTimeFormat("nl-NL", { month: "short", day: "numeric" });
	const points = Array.from({ length: buckets }, (_, i) => {
		const from = start + i * step;
		const these = counted.filter((o) => inRange(o, from, from + step));
		return { label: fmt.format(new Date(from)), value: these.reduce((n, o) => n + value(o), 0), orders: these.length };
	});

	return {
		points,
		total,
		previous,
		change: previous === 0 ? null : Math.round(((total - previous) / previous) * 100),
		counted,
		excluded: { cancelled: windowed.filter((o) => o.status === "cancelled"), refunded: windowed.filter((o) => o.status === "refunded") },
	};
}

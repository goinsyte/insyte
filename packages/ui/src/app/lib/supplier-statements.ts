import { HISTORY, type HistOrder } from "./analytics/history";
import { products } from "../../data-source";

/**
 * What Northwind owes the supplier, month by month: every line it shipped, at the cost price agreed
 * per product, less the returns that were the supplier's fault (damaged, not as pictured), at the
 * same cost. Read from the supplier's own history, so the figures add up to the rows.
 */

export type StatementLine = { order: string; day: string; title: string; qty: number; unit: number; total: number; kind: "shipped" | "correction"; reason?: string };

export type Statement = {
	id: string;
	month: string;
	label: string;
	shipped: number;
	corrections: number;
	total: number;
	lines: StatementLine[];
	status: "paid" | "processing" | "open";
	/** When it was or will be paid. */
	payDay: string;
};

const COST = new Map(products.map((p) => [p.id, p.cost ?? p.price * 0.4]));
const FAULT = new Set(["Damaged", "Not as pictured"]);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const MONTH = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });

export function statementsFor(supplierId: string): Statement[] {
	const mine = HISTORY.orders.filter((o) => o.supplier === supplierId && o.status !== "cancelled" && o.took !== undefined);
	const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
	return months
		.map((m, i) => {
			const rows = mine.filter((o) => o.day.startsWith(m));
			const line = (o: HistOrder, kind: StatementLine["kind"]): StatementLine => {
				const unit = COST.get(o.product) ?? 0;
				const sign = kind === "correction" ? -1 : 1;
				return {
					order: o.number,
					day: o.day,
					title: o.title,
					qty: o.qty,
					unit,
					total: sign * unit * o.qty,
					kind,
					...(kind === "correction" ? { reason: o.refundReason === "Damaged" ? "Beschadigd aangekomen" : "Anders dan op de foto" } : {}),
				};
			};
			const shipped = rows.map((o) => line(o, "shipped"));
			const corrections = rows.filter((o) => o.status === "refunded" && FAULT.has(o.refundReason ?? "")).map((o) => line(o, "correction"));
			const s = shipped.reduce((n, l) => n + l.total, 0);
			const c = corrections.reduce((n, l) => n + l.total, 0);
			const next = months[i + 1] ?? "2026-06";
			return {
				id: m,
				month: m,
				label: cap(MONTH.format(new Date(`${m}-15T12:00:00Z`))),
				shipped: s,
				corrections: c,
				total: s + c,
				lines: [...shipped, ...corrections].sort((a, b) => a.day.localeCompare(b.day)),
				status: (i === months.length - 1 ? "processing" : "paid") as Statement["status"],
				payDay: `${next}-15`,
			};
		})
		// A month the supplier shipped nothing in has no statement.
		.filter((s) => s.lines.length > 0)
		.reverse();
}

export const STATEMENT_STATUS: Record<Statement["status"], { label: string; tone: "success" | "info" | "warning" }> = {
	paid: { label: "Betaald", tone: "success" },
	processing: { label: "Wordt verwerkt", tone: "info" },
	open: { label: "Lopend", tone: "warning" },
};

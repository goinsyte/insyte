import { counts, isLate, metrics, round1, type Span } from "../analytics/engine";
import { HISTORY, HISTORY_END } from "../analytics/history";
import { formatCurrency } from "../format";
import { convert } from "../money";
import type { Chargeback, Currency, Ticket } from "../types/domain";

/*
 * The pulse: six figures the operator checks without opening anything, each the head of the screen
 * that explains it. They are read off the same history the analytics page reads (`HISTORY`), over
 * the board's own window ending on the history's last day, against the window before it — so a
 * figure here and the same figure on Analyse are one calculation. The two that are about now rather
 * than a period (open tickets, money in dispute) read the live workspace, and change when a ticket
 * is closed or a case is filed anywhere in the console.
 */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const END = Date.parse(`${HISTORY_END}T12:00:00Z`);

function span(days: number, offset: number): Span {
	const to = iso(END - offset * days * DAY);
	const from = iso(END - (offset * days + days - 1) * DAY);
	return { month: "2026-05", days, from, to, label: `${from} – ${to}`, short: to, abbr: "mei", inProgress: false };
}

/** The window cut into at most 14 buckets, oldest first, for the sparkline. */
function buckets(days: number): Array<{ from: string; to: string }> {
	const n = Math.min(14, days);
	const size = days / n;
	return Array.from({ length: n }, (_, i) => {
		const startOff = Math.round(days - i * size) - 1;
		const endOff = Math.round(days - (i + 1) * size);
		return { from: iso(END - startOff * DAY), to: iso(END - endOff * DAY) };
	});
}

export type PulseFigure = {
	id: "revenue" | "orders" | "tickets" | "dispute" | "ontime" | "reply";
	label: string;
	/** The value to count up to, and how it is written. */
	value: number;
	format: (n: number) => string;
	/** One line of what the figure is, for the title and the screen reader. */
	detail: string;
	/** Change against the window before, already signed and worded, or null when there is none. */
	delta: { text: string; good: boolean | null } | null;
	spark: number[];
	to: string;
	search?: Record<string, string>;
};

const signed = (n: number, digits = 0) =>
	`${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export function pulse(
	days: number,
	currency: Currency,
	live: { tickets: ReadonlyArray<Ticket>; chargebacks: ReadonlyArray<Chargeback> },
): PulseFigure[] {
	const A = metrics(span(days, 0));
	const B = metrics(span(days, 1));
	// The history starts on 1 January: a window before that is partly empty and compares nothing.
	const comparable = span(days, 1).from >= "2026-01-01";
	const parts = buckets(days);
	const inPart = (day: string, p: { from: string; to: string }) => day >= p.from && day <= p.to;
	const money = (n: number) => formatCurrency(n, currency).replace(/,00$/, "");
	const pctDelta = (a: number, b: number, upGood = true) => {
		if (b === 0 || !comparable) return null;
		const p = Math.round(((a - b) / b) * 1000) / 10;
		return { text: `${signed(p, Math.abs(p) < 10 ? 1 : 0)}%`, good: p === 0 ? null : upGood ? p > 0 : p < 0 };
	};

	const openTickets = live.tickets.filter((t) => t.status !== "done" && !t.archived_at && !t.deleted_at && !t.spam_at);
	const disputed = live.chargebacks.filter((c) => c.status === "open" || c.status === "awaiting_evidence" || c.status === "submitted");
	const atStake = disputed.reduce((n, c) => n + convert(c.amount, c.currency, currency), 0);
	const newTicketsA = A.tickets.length;
	const newTicketsB = B.tickets.length;

	return [
		{
			id: "revenue",
			label: "Omzet",
			value: convert(A.revenue, "USD", currency),
			format: (n) => money(Math.round(n)),
			detail: `Betaalde bestellingen in de laatste ${days} dagen, zonder geannuleerde en terugbetaalde.`,
			delta: pctDelta(A.revenue, B.revenue),
			spark: parts.map((p) => A.counted.filter((o) => inPart(o.day, p)).reduce((n, o) => n + o.total, 0)),
			to: "/analytics",
		},
		{
			id: "orders",
			label: "Bestellingen",
			value: A.counted.length,
			format: (n) => Math.round(n).toLocaleString("nl-NL"),
			detail: `Bestellingen die meetellen in de laatste ${days} dagen.`,
			delta: pctDelta(A.counted.length, B.counted.length),
			spark: parts.map((p) => A.orders.filter((o) => counts(o) && inPart(o.day, p)).length),
			to: "/orders",
		},
		{
			id: "tickets",
			label: "Open tickets",
			value: openTickets.length,
			format: (n) => String(Math.round(n)),
			detail: `Nu open. ${newTicketsA} nieuwe tickets in de laatste ${days} dagen, de verandering is op het aantal nieuwe.`,
			delta: newTicketsB === 0 || !comparable ? null : { text: `${signed(Math.round(((newTicketsA - newTicketsB) / newTicketsB) * 100))}%`, good: newTicketsA === newTicketsB ? null : newTicketsA < newTicketsB },
			spark: parts.map((p) => A.tickets.filter((t) => inPart(t.day, p)).length),
			to: "/tickets",
		},
		{
			id: "dispute",
			label: "In geschil",
			value: atStake,
			format: (n) => money(Math.round(n)),
			detail: `${disputed.length} ${disputed.length === 1 ? "zaak" : "zaken"} open of ingediend.`,
			delta: disputed.length === 0 ? null : { text: `${disputed.length} ${disputed.length === 1 ? "zaak" : "zaken"}`, good: null },
			spark: parts.map((p) => A.disputes.filter((d) => inPart(d.day, p)).reduce((n, d) => n + d.amount, 0)),
			to: "/chargebacks",
		},
		{
			id: "ontime",
			label: "Op tijd geleverd",
			value: A.onTime,
			format: (n) => `${round1(n).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
			detail: `${A.delivered.length} bestellingen bezorgd in de laatste ${days} dagen.`,
			delta: B.delivered.length === 0 || !comparable ? null : { text: `${signed(round1(A.onTime - B.onTime), 1)} pt`, good: A.onTime === B.onTime ? null : A.onTime > B.onTime },
			spark: parts.map((p) => {
				const d = A.delivered.filter((o) => o.arrived !== undefined && inPart(o.arrived, p));
				return d.length === 0 ? 0 : ((d.length - d.filter(isLate).length) / d.length) * 100;
			}),
			to: "/analytics",
		},
		{
			id: "reply",
			label: "Eerste reactie",
			value: A.firstH,
			format: (n) => `${round1(n).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} u`,
			detail: "Gemiddelde tijd tot het eerste antwoord op een ticket.",
			delta: B.tickets.length === 0 || !comparable ? null : { text: `${signed(round1(A.firstH - B.firstH), 1)} u`, good: A.firstH === B.firstH ? null : A.firstH < B.firstH },
			spark: parts.map((p) => {
				const t = A.tickets.filter((x) => inPart(x.day, p));
				return t.length === 0 ? 0 : t.reduce((n, x) => n + x.firstH, 0) / t.length;
			}),
			to: "/tickets",
		},
	];
}

/** Whether there is any history at all; on the first day the pulse has nothing to say. */
export const hasHistory = () => HISTORY.orders.length > 0;

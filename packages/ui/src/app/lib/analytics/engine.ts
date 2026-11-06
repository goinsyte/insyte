import {
	COUNTRY_IN,
	COUNTRY_NAME,
	type Country,
	type DisputeReason,
	HISTORY,
	type HistDispute,
	type HistOrder,
	type HistTicket,
	REFUND_REASON_LABEL,
	DISPUTE_REASON_LABEL,
	CHANNEL_LABEL,
	type Channel,
	type RefundReason,
	STORE_NAME,
	SUPPLIER_NAME,
} from "./history";

/**
 * Analytics, computed. Two periods are compared over the same number of days — May is the month
 * in progress, so May against April reads 1–26 May against 1–26 April — and every figure below is
 * a sum or a ratio over the history's rows in those days. Findings are the largest movements,
 * ranked by how much they cost or made, and each one carries the rows that make it true.
 */

export const MONTHS = [
	{ id: "2026-01", label: "Januari", abbr: "jan" },
	{ id: "2026-02", label: "Februari", abbr: "feb" },
	{ id: "2026-03", label: "Maart", abbr: "mrt" },
	{ id: "2026-04", label: "April", abbr: "apr" },
	{ id: "2026-05", label: "Mei", abbr: "mei" },
] as const;
export type Month = (typeof MONTHS)[number]["id"];

const DAYS_IN: Record<Month, number> = { "2026-01": 31, "2026-02": 28, "2026-03": 31, "2026-04": 30, "2026-05": 31 };
/** May is under way: the history runs to the 26th. */
const TO_DATE: Partial<Record<Month, number>> = { "2026-05": 26 };

export type Span = { month: Month; days: number; from: string; to: string; label: string; short: string; abbr: string; inProgress: boolean };

/** The month's name as it reads in running text: lower case, "mei". */
const monthLabel = (m: Month) => MONTHS.find((x) => x.id === m)!.label.toLowerCase();
const monthAbbr = (m: Month) => MONTHS.find((x) => x.id === m)!.abbr;
const pad = (n: number) => String(n).padStart(2, "0");

/** Both periods, cut to the same length so a month in progress is not compared with a full one. */
export function spans(a: Month, b: Month): { A: Span; B: Span } {
	const len = (m: Month) => TO_DATE[m] ?? DAYS_IN[m];
	const days = Math.min(len(a), len(b));
	const make = (m: Month): Span => {
		const full = days === DAYS_IN[m];
		return {
			month: m,
			days,
			from: `${m}-01`,
			to: `${m}-${pad(days)}`,
			label: full ? `${monthLabel(m)} 2026` : `1–${days} ${monthLabel(m)}`,
			short: full ? monthLabel(m) : `1–${days} ${monthAbbr(m)}`,
			abbr: monthAbbr(m),
			inProgress: TO_DATE[m] !== undefined,
		};
	};
	return { A: make(a), B: make(b) };
}

const inSpan = (day: string, s: Span) => day >= s.from && day <= s.to;
const sum = <T>(xs: ReadonlyArray<T>, f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const avg = <T>(xs: ReadonlyArray<T>, f: (x: T) => number) => (xs.length === 0 ? 0 : sum(xs, f) / xs.length);
export const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** An order counts toward revenue once it is paid and not cancelled or refunded. */
export const counts = (o: HistOrder) => o.status !== "cancelled" && o.status !== "refunded";
export const isLate = (o: HistOrder) => o.took !== undefined && o.took > o.promised;

export type Metrics = {
	span: Span;
	orders: HistOrder[];
	counted: HistOrder[];
	revenue: number;
	aov: number;
	delivered: HistOrder[];
	onTime: number;
	lateShort: number;
	lateLong: number;
	refunds: HistOrder[];
	refundRate: number;
	disputes: HistDispute[];
	tickets: HistTicket[];
	firstH: number;
	resolveH: number;
};

const cache = new Map<string, Metrics>();

export function metrics(s: Span): Metrics {
	const key = `${s.from}:${s.to}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const orders = HISTORY.orders.filter((o) => inSpan(o.day, s));
	const counted = orders.filter(counts);
	// Delivery is read by the day a parcel arrived: the orders of the last few days have not, yet.
	const delivered = HISTORY.orders.filter((o) => o.arrived !== undefined && inSpan(o.arrived, s));
	const late = delivered.filter(isLate);
	const refunds = orders.filter((o) => o.status === "refunded");
	const tickets = HISTORY.tickets.filter((t) => inSpan(t.day, s));
	const m: Metrics = {
		span: s,
		orders,
		counted,
		revenue: sum(counted, (o) => o.total),
		aov: avg(counted, (o) => o.total),
		delivered,
		onTime: delivered.length === 0 ? 0 : round1(((delivered.length - late.length) / delivered.length) * 100),
		lateShort: late.filter((o) => o.took! - o.promised === 1).length,
		lateLong: late.filter((o) => o.took! - o.promised > 1).length,
		refunds,
		refundRate: orders.length === 0 ? 0 : (refunds.length / orders.length) * 100,
		disputes: HISTORY.disputes.filter((d) => inSpan(d.day, s)),
		tickets,
		firstH: round1(avg(tickets, (t) => t.firstH)),
		resolveH: round1(avg(tickets, (t) => t.resolveH)),
	};
	cache.set(key, m);
	return m;
}

/* ── Series ─────────────────────────────────────────────────────────────────────────────────── */

/** The two periods week by week, aligned on the day of the month: days 1–7, 8–14, and so on. */
export type WeekPoint = {
	label: string;
	week: number;
	revenue: number;
	revenuePrev: number;
	orders: number;
	onTime: number;
	onTimePrev: number;
	refunds: number;
	refundsPrev: number;
	/** Insyte's estimate for the rest of a month in progress: the middle, and its range. */
	forecast?: number;
	band?: [number, number];
};

export function weekly(A: Span, B: Span): WeekPoint[] {
	const a = metrics(A);
	const b = metrics(B);
	const out: WeekPoint[] = [];
	const day = (o: { day: string }) => Number(o.day.slice(8, 10));
	for (let w = 0; w * 7 < A.days; w++) {
		const lo = w * 7 + 1;
		const hi = Math.min(A.days, lo + 6);
		const pickW = <T extends { day: string }>(xs: T[]) => xs.filter((o) => day(o) >= lo && day(o) <= hi);
		const arrivedIn = (xs: HistOrder[]) => xs.filter((o) => Number(o.arrived!.slice(8, 10)) >= lo && Number(o.arrived!.slice(8, 10)) <= hi);
		const ta = arrivedIn(a.delivered);
		const tb = arrivedIn(b.delivered);
		const onTime = (xs: HistOrder[]) => (xs.length === 0 ? 0 : round1(((xs.length - xs.filter(isLate).length) / xs.length) * 100));
		out.push({
			label: lo === hi ? `${lo}` : `${lo}–${hi}`,
			week: w,
			revenue: sum(pickW(a.counted), (o) => o.total),
			revenuePrev: sum(pickW(b.counted), (o) => o.total),
			orders: pickW(a.orders).length,
			onTime: onTime(ta),
			onTimePrev: onTime(tb),
			refunds: pickW(a.refunds).length,
			refundsPrev: pickW(b.refunds).length,
		});
	}
	// A month in progress gets the rest of it estimated from the last fourteen days' daily run rate.
	if (A.inProgress && A.days < DAYS_IN[A.month]) {
		const left = DAYS_IN[A.month] - A.days;
		const daily: number[] = [];
		for (let d = A.days - 13; d <= A.days; d++) {
			const key = `${A.month}-${pad(d)}`;
			daily.push(sum(HISTORY.orders.filter((o) => o.day === key && counts(o)), (o) => o.total));
		}
		const mean = avg(daily, (x) => x);
		const sd = Math.sqrt(avg(daily, (x) => (x - mean) ** 2));
		const mid = mean * left;
		const spread = sd * Math.sqrt(left) * 1.28; // an 80% range
		const last = out[out.length - 1];
		if (last) {
			last.forecast = last.revenue;
			last.band = [last.revenue, last.revenue];
		}
		out.push({
			label: `${A.days + 1}–${DAYS_IN[A.month]}`,
			week: out.length,
			revenue: Number.NaN,
			revenuePrev: Number.NaN,
			orders: 0,
			onTime: Number.NaN,
			onTimePrev: Number.NaN,
			refunds: Number.NaN,
			refundsPrev: Number.NaN,
			forecast: Math.round(mid),
			band: [Math.round(Math.max(0, mid - spread)), Math.round(mid + spread)],
		});
	}
	return out;
}

/** The two periods day by day, aligned on the day of the month, with on-time as a rolling week. */
export type DayPoint = {
	label: string;
	day: number;
	revenue: number | null;
	revenuePrev: number | null;
	onTime: number | null;
	onTimePrev: number | null;
	forecast?: number;
	band?: [number, number];
};

export function daily(A: Span, B: Span): DayPoint[] {
	const rev = (s: Span, d: number) => sum(HISTORY.orders.filter((o) => o.day === `${s.month}-${pad(d)}` && counts(o)), (o) => o.total);
	const rolling = (s: Span, d: number) => {
		const from = `${s.month}-${pad(Math.max(1, d - 6))}`;
		const to = `${s.month}-${pad(d)}`;
		const xs = HISTORY.orders.filter((o) => o.arrived !== undefined && o.arrived >= from && o.arrived <= to);
		return xs.length === 0 ? null : round1(((xs.length - xs.filter(isLate).length) / xs.length) * 100);
	};
	const out: DayPoint[] = [];
	for (let d = 1; d <= A.days; d++) {
		out.push({ label: String(d), day: d, revenue: rev(A, d), revenuePrev: rev(B, d), onTime: rolling(A, d), onTimePrev: rolling(B, d) });
	}
	if (A.inProgress && A.days < DAYS_IN[A.month]) {
		const last14 = out.slice(-14).map((p) => p.revenue ?? 0);
		const mean = avg(last14, (x) => x);
		const sd = Math.sqrt(avg(last14, (x) => (x - mean) ** 2));
		const lastPoint = out[out.length - 1];
		if (lastPoint) {
			lastPoint.forecast = lastPoint.revenue ?? 0;
			lastPoint.band = [lastPoint.revenue ?? 0, lastPoint.revenue ?? 0];
		}
		for (let d = A.days + 1; d <= DAYS_IN[A.month]; d++) {
			out.push({
				label: String(d),
				day: d,
				revenue: null,
				revenuePrev: null,
				onTime: null,
				onTimePrev: null,
				forecast: Math.round(mean),
				band: [Math.round(Math.max(0, mean - sd * 1.28)), Math.round(mean + sd * 1.28)],
			});
		}
	}
	return out;
}

/* ── Breakdowns ─────────────────────────────────────────────────────────────────────────────── */

export type Dim = "store" | "country" | "product" | "supplier" | "channel";
export type Row = { key: string; label: string; a: number; b: number; delta: number };

const keyOf: Record<Dim, (o: HistOrder) => string> = {
	store: (o) => o.store,
	country: (o) => o.country,
	product: (o) => o.product,
	supplier: (o) => o.supplier,
	channel: (o) => o.channel,
};

const TITLE: Record<string, string> = Object.fromEntries(HISTORY.orders.map((o) => [o.product, o.title]));

export function labelOf(dim: Dim, key: string): string {
	if (dim === "store") return STORE_NAME[key] ?? key;
	if (dim === "supplier") return SUPPLIER_NAME[key] ?? key;
	if (dim === "country") return COUNTRY_NAME[key as Country] ?? key;
	if (dim === "product") return TITLE[key] ?? key;
	if (dim === "channel") return CHANNEL_LABEL[key as Channel] ?? key;
	return key;
}

/** Revenue (or another measure) by a dimension, both periods, largest movement first. */
export function breakdown(
	A: Span,
	B: Span,
	dim: Dim,
	measure: (xs: HistOrder[]) => number = (xs) => sum(xs.filter(counts), (o) => o.total),
	from: (m: Metrics) => HistOrder[] = (m) => m.orders,
): Row[] {
	const group = (xs: HistOrder[]) => {
		const g = new Map<string, HistOrder[]>();
		for (const o of xs) {
			const k = keyOf[dim](o);
			g.set(k, [...(g.get(k) ?? []), o]);
		}
		return g;
	};
	const ga = group(from(metrics(A)));
	const gb = group(from(metrics(B)));
	const keys = new Set([...ga.keys(), ...gb.keys()]);
	return [...keys]
		.map((k) => {
			const a = measure(ga.get(k) ?? []);
			const b = measure(gb.get(k) ?? []);
			return { key: k, label: labelOf(dim, k), a, b, delta: a - b };
		})
		.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** A revenue change, taken apart: how much is more or fewer orders, and how much is order size. */
export function decompose(A: Span, B: Span) {
	const a = metrics(A);
	const b = metrics(B);
	const volume = (a.counted.length - b.counted.length) * b.aov;
	const size = (a.aov - b.aov) * a.counted.length;
	return { total: a.revenue - b.revenue, volume, size };
}

/* ── Findings ───────────────────────────────────────────────────────────────────────────────── */

export type Focus =
	| { chart: "revenue"; week?: number }
	| { chart: "delivery" }
	| { chart: "refunds"; reason?: string; product?: string }
	| { chart: "disputes"; reason?: DisputeReason }
	| { chart: "support"; weekday?: number }
	| { chart: "heatmap"; product?: string; store?: string }
	| { chart: "leadtime"; supplier?: string };

export type ProposalKind =
	| { kind: "supplier-ticket"; supplier: string; subject: string; body: string }
	| { kind: "pause-ads"; product: string; title: string }
	| { kind: "automation"; template: string };

export type FindingProposal = { title: string; body: string; why: string; confidence: number; fileLabel: string; action: ProposalKind };

export type Driver = { label: string; value: number; detail?: string };

export type Finding = {
	id: string;
	tone: "good" | "bad" | "neutral";
	metric: string;
	/** The figure, as it reads in the brief. */
	figure: string;
	/** One sentence, the claim. */
	headline: string;
	/** The explanation, a few sentences, every number in it computed. */
	explain: string;
	/** What moved it, largest first, signed. */
	drivers: Driver[];
	driverUnit: "$" | "orders" | "pts" | "refunds" | "cases" | "h";
	focus: Focus;
	/** The rows that make the claim true. */
	records: HistOrder[];
	/** How much it matters, for ranking: euros at stake, roughly. */
	weight: number;
	proposal?: FindingProposal;
};

export const money = (n: number) =>
	new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
/** A number as it reads in Dutch: 1.594, 92,4. */
export const num = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
/** A number with exactly one decimal: 7,6. */
export const dec1 = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number, f: (x: number) => string = (x) => num(x)) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${f(Math.abs(n))}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const WEEKDAY = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

export function findings(A: Span, B: Span): Finding[] {
	const a = metrics(A);
	const b = metrics(B);
	const out: Finding[] = [];

	// Revenue: the change, and the product × store that moved it most.
	{
		const change = pct(a.revenue, b.revenue);
		const d = decompose(A, B);
		const byPs = (m: Metrics) => {
			const g = new Map<string, number>();
			for (const o of m.counted) g.set(`${o.product}|${o.store}`, (g.get(`${o.product}|${o.store}`) ?? 0) + o.total);
			return g;
		};
		const ga = byPs(a);
		const gb = byPs(b);
		const moves = [...new Set([...ga.keys(), ...gb.keys()])]
			.map((k) => ({ k, delta: (ga.get(k) ?? 0) - (gb.get(k) ?? 0) }))
			.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
		const top = moves[0];
		const [prod, store] = (top?.k ?? "|").split("|") as [string, string];
		const topName = `${labelOf("product", prod)} in ${STORE_NAME[store] ?? store}`;
		const topOrders = (m: Metrics) => m.counted.filter((o) => o.product === prod && o.store === store);
		const auroraGap = prod === "prod_2000" && store === "store_eu";
		const share = top && d.total !== 0 ? Math.round((top.delta / d.total) * 100) : 0;
		out.push({
			id: "revenue",
			tone: change >= 0 ? "good" : "bad",
			metric: "Omzet",
			figure: signed(round1(change), (x) => `${dec1(x)}%`),
			headline: `De omzet ${change >= 0 ? "steeg" : "daalde"} met ${dec1(Math.abs(change))}% naar ${money(a.revenue)}. De grootste verschuiving is ${topName}, ${signed(top?.delta ?? 0, money)}.`,
			explain: [
				`${money(a.revenue)} uit ${plural(a.counted.length, "betaalde bestelling", "betaalde bestellingen")} in ${A.label}, tegenover ${money(b.revenue)} uit ${b.counted.length.toLocaleString("nl-NL")} in ${B.label}.`,
				`${signed(Math.round(d.volume), money)} van het verschil komt door ${d.volume >= 0 ? "meer" : "minder"} bestellingen en ${signed(Math.round(d.size), money)} door de bestelgrootte: de gemiddelde bestelling ging van ${money(b.aov)} naar ${money(a.aov)}.`,
				`${topName} ging van ${topOrders(b).length} naar ${topOrders(a).length} bestellingen${share !== 0 && Math.abs(share) <= 200 ? `, ${Math.abs(share)}% van het nettoverschil` : ""}.`,
				auroraGap && change < 0 ? "De Aurora fleece met capuchon was in de EU-winkel uitverkocht van 14 april tot 6 mei: die bestellingen zijn niet misgelopen, ze konden niet geplaatst worden." : "",
				auroraGap && change >= 0 ? "De Aurora fleece met capuchon is sinds 7 mei weer op voorraad in de EU-winkel, nadat hij op 14 april was uitverkocht." : "",
				prod === "prod_2018" && (top?.delta ?? 0) < 0 ? "De Cascade pufferjas is een winterjas en verkoopt ook zo: dit is het einde van het seizoen, geen probleem om op te lossen." : "",
			]
				.filter(Boolean)
				.join(" "),
			drivers: [
				{ label: "Meer of minder bestellingen", value: Math.round(d.volume), detail: `${b.counted.length.toLocaleString("nl-NL")} → ${a.counted.length.toLocaleString("nl-NL")} bestellingen` },
				{ label: "Bestelgrootte", value: Math.round(d.size), detail: `${money(b.aov)} → ${money(a.aov)} gemiddeld` },
				...moves.slice(0, 4).map((m) => {
					const [p, s] = m.k.split("|") as [string, string];
					return { label: `${labelOf("product", p)} · ${(STORE_NAME[s] ?? s).replace("Northwind ", "")}`, value: Math.round(m.delta) };
				}),
			],
			driverUnit: "$",
			focus: { chart: "heatmap", product: prod, store },
			records: topOrders(a),
			weight: Math.abs(a.revenue - b.revenue),
			proposal:
				auroraGap && change < 0
					? {
							title: "Waarschuwen voordat Aurora weer uitverkoopt",
							body: "Een automatisering die operations laat weten wanneer de Aurora fleece met capuchon onder de 60 stuks zakt, en de campagnes pauzeert die hem verkopen.",
							why: "Hij was 23 dagen uitverkocht in de EU-winkel; de waarschuwing was zo'n week eerder gekomen.",
							confidence: 86,
							fileLabel: "Concept opstellen",
							action: { kind: "automation", template: "tpl_stock" },
						}
					: undefined,
		});
	}

	// Delivery: on-time, and the supplier × country where lateness grew most.
	{
		const pts = round1(a.onTime - b.onTime);
		const late = (m: Metrics) => {
			const g = new Map<string, HistOrder[]>();
			for (const o of m.delivered.filter(isLate)) g.set(`${o.supplier}|${o.country}`, [...(g.get(`${o.supplier}|${o.country}`) ?? []), o]);
			return g;
		};
		const la = late(a);
		const lb = late(b);
		const moves = [...new Set([...la.keys(), ...lb.keys()])]
			.map((k) => ({ k, a: la.get(k)?.length ?? 0, b: lb.get(k)?.length ?? 0 }))
			.sort((x, y) => y.a - y.b - (x.a - x.b));
		const top = moves[0];
		const [sup, country] = (top?.k ?? "|").split("|") as [string, Country];
		const rows = la.get(top?.k ?? "") ?? [];
		const avgLate = round1(avg(rows, (o) => o.took! - o.promised));
		const kestrelDe = sup === "sup_kestrel" && country === "DE" && top && top.a - top.b > 3;
		out.push({
			id: "delivery",
			tone: pts >= 0 ? "good" : "bad",
			metric: "Levering op tijd",
			figure: signed(pts, (x) => `${num(x)} pp`),
			headline: `${Math.abs(pts) < 0.5 ? `Levering op tijd bleef op ${num(a.onTime)}%` : `Levering op tijd ${pts >= 0 ? "steeg" : "daalde"} ${num(Math.abs(pts))} procentpunt naar ${num(a.onTime)}%`}${top && top.a > top.b ? `${Math.abs(pts) < 0.5 ? ", maar bij" : ". Bij"} ${SUPPLIER_NAME[sup]} naar ${COUNTRY_IN[country]} ging het van ${plural(top.b, "te laat pakket", "te late pakketten")} naar ${top.a}.` : "."}`,
			explain: [
				`${(a.delivered.length - a.lateShort - a.lateLong).toLocaleString("nl-NL")} van de ${a.delivered.length.toLocaleString("nl-NL")} bezorgde bestellingen kwamen aan op of vóór de datum die bij het afrekenen werd beloofd, tegenover ${num(b.onTime)}% in ${B.label}.`,
				`${plural(a.lateShort, "bestelling", "bestellingen")} ${a.lateShort === 1 ? "was" : "waren"} een dag te laat en ${a.lateLong} meer dan een dag.`,
				top && top.a > top.b ? `De toename zit vooral in pakketten van ${SUPPLIER_NAME[sup]} naar ${COUNTRY_IN[country]}: ${top.a} te laat, gemiddeld ${num(avgLate)} ${avgLate === 1 ? "dag" : "dagen"}.` : "",
				kestrelDe ? "Die pakketten komen op tijd aan bij de Duitse grens en wachten dan: de extra dagen zitten tussen de overdracht en de eerste scan van de vervoerder, en zo ziet een douanestop eruit." : "",
			]
				.filter(Boolean)
				.join(" "),
			drivers: moves.slice(0, 5).map((m) => {
				const [s, c] = m.k.split("|") as [string, Country];
				return { label: `${SUPPLIER_NAME[s] ?? s} → ${c}`, value: m.a - m.b, detail: `${m.b} → ${m.a} te laat` };
			}),
			driverUnit: "orders",
			focus: { chart: "leadtime", supplier: sup },
			records: rows,
			weight: Math.abs(pts) * 900 + (top ? (top.a - top.b) * 120 : 0),
			proposal: kestrelDe
				? {
						title: `${SUPPLIER_NAME[sup]} vragen naar de douanestops in Duitsland`,
						body: `Een ticket aan ${SUPPLIER_NAME[sup]} met de ${rows.length} te late Duitse bestellingen als bijlage, met de vraag of de handelsfactuur op 1 mei is veranderd.`,
						why: `Elk ervan verloor zijn dagen tussen de overdracht en de eerste scan van de vervoerder; verder veranderde er niets aan de route.`,
						confidence: 82,
						fileLabel: "Ticket openen",
						action: {
							kind: "supplier-ticket",
							supplier: SUPPLIER_NAME[sup] ?? sup,
							subject: "Duitse pakketten sinds 1 mei vastgehouden bij de douane",
							body: `Sinds 1 mei kwamen ${rows.length} pakketten naar Duitsland gemiddeld ${num(avgLate)} dagen te laat aan, telkens tussen overdracht en eerste scan. Zijn de handelsfactuur of de HS-codes veranderd? Bestellingen: ${rows.slice(0, 12).map((o) => o.number).join(", ")}${rows.length > 12 ? "…" : ""}`,
						},
					}
				: undefined,
		});
	}

	// Refunds: the reason that grew most, and the product it grew on.
	{
		const reasons = (m: Metrics) => {
			const g = new Map<RefundReason, HistOrder[]>();
			for (const o of m.refunds) g.set(o.refundReason!, [...(g.get(o.refundReason!) ?? []), o]);
			return g;
		};
		const ra = reasons(a);
		const rb = reasons(b);
		const moves = [...new Set([...ra.keys(), ...rb.keys()])]
			.map((k) => ({ k, a: ra.get(k)?.length ?? 0, b: rb.get(k)?.length ?? 0 }))
			.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
		const top = moves[0];
		const rows = ra.get(top?.k as RefundReason) ?? [];
		const byProduct = new Map<string, number>();
		for (const o of rows) byProduct.set(o.product, (byProduct.get(o.product) ?? 0) + 1);
		const [prod, n] = [...byProduct].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
		const sold = a.orders.filter((o) => o.product === prod).length;
		const shorts = prod === "prod_2008" && top?.k === "Wrong size";
		const rateA = round1(a.refundRate);
		const topLabel = top ? REFUND_REASON_LABEL[top.k] : "";
		out.push({
			id: "refunds",
			tone: (top?.a ?? 0) > (top?.b ?? 0) ? "bad" : "good",
			metric: "Terugbetalingen",
			figure: signed((top?.a ?? 0) - (top?.b ?? 0), (x) => `${x}`),
			headline: `Terugbetalingen wegens “${topLabel}” gingen van ${top?.b} naar ${top?.a}${n > 1 ? `, waarvan ${n} voor ${labelOf("product", prod)}` : ""}.`,
			explain: [
				`${plural(a.refunds.length, "bestelling", "bestellingen")} terugbetaald in ${A.label}, ${num(rateA)}% van de bestellingen, tegenover ${num(round1(b.refundRate))}% in ${B.label}.`,
				n > 1 ? `${n} van de ${top?.a} terugbetalingen wegens “${topLabel}” zijn ${labelOf("product", prod)}, waarvan er in deze periode ${sold} zijn verkocht: ${Math.round((n / Math.max(1, sold)) * 100)}% kwam om die reden terug.` : "",
				shorts ? "Ze beginnen op 20 april, met de partij die die week binnenkwam, en volgens de retournotities valt die een maat te klein. Daarvoor waren de terugbetalingen van de Trailhead als die van elk ander product." : "",
			]
				.filter(Boolean)
				.join(" "),
			drivers: moves.slice(0, 5).map((m) => ({ label: REFUND_REASON_LABEL[m.k], value: m.a - m.b, detail: `${m.b} → ${m.a}` })),
			driverUnit: "refunds",
			focus: { chart: "refunds", reason: top?.k, product: prod },
			records: rows,
			weight: Math.abs((top?.a ?? 0) - (top?.b ?? 0)) * 140,
			proposal: shorts
				? {
						title: "Meta-advertenties voor Trailhead korte broek pauzeren",
						body: "Niet langer betalen om een partij te verkopen die terugkomt, tot Allure Fulfillment de maatvoering bevestigt. Organische en Klaviyo-verkopen lopen door.",
						why: `${n} van de ${sold} verkochte kwamen sinds de nieuwe partij terug wegens “${REFUND_REASON_LABEL["Wrong size"]}”; de meeste kwamen binnen via Meta.`,
						confidence: 78,
						fileLabel: "Advertenties pauzeren",
						action: { kind: "pause-ads", product: prod, title: labelOf("product", prod) },
					}
				: undefined,
		});
	}

	// Disputes: count and the reason behind the change.
	{
		const by = (xs: HistDispute[]) => {
			const g = new Map<DisputeReason, number>();
			for (const d of xs) g.set(d.reason, (g.get(d.reason) ?? 0) + 1);
			return g;
		};
		const da = by(a.disputes);
		const db = by(b.disputes);
		const moves = [...new Set([...da.keys(), ...db.keys()])]
			.map((k) => ({ k, a: da.get(k) ?? 0, b: db.get(k) ?? 0 }))
			.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
		const top = moves[0];
		const tied = a.disputes.filter((d) => d.reason === "Item not received");
		const lateLinked = tied.filter((d) => {
			const o = HISTORY.orders.find((x) => x.id === d.order);
			return o && o.took !== undefined && o.took - o.promised > 2;
		}).length;
		const ids = new Set(a.disputes.map((d) => d.order));
		out.push({
			id: "disputes",
			tone: a.disputes.length <= b.disputes.length ? "good" : "bad",
			metric: "Geschillen",
			figure: signed(a.disputes.length - b.disputes.length, (x) => `${x}`),
			headline: `${plural(a.disputes.length, "geschil", "geschillen")} geopend, ${a.disputes.length > b.disputes.length ? "meer dan" : a.disputes.length < b.disputes.length ? "minder dan" : "evenveel als"} de ${b.disputes.length} in ${B.label}; “${top ? DISPUTE_REASON_LABEL[top.k] : ""}” veranderde het meest.`,
			explain: [
				`Er staat ${money(sum(a.disputes, (d) => d.amount))} onder geschil uit ${A.label}.`,
				tied.length > 0
					? `${lateLinked === tied.length ? (tied.length === 1 ? "Het enige geval" : tied.length === 2 ? "Beide gevallen" : `Alle ${tied.length} gevallen`) : `${lateLinked} van de ${tied.length} gevallen`} van “${DISPUTE_REASON_LABEL["Item not received"]}” ${tied.length === 1 ? "was een pakket dat" : "waren pakketten die"} meer dan twee dagen te laat ${tied.length === 1 ? "aankwam" : "aankwamen"}${lateLinked * 2 > a.disputes.length ? ", dus de meeste geschillen volgen uit het leveringsprobleem en niet uit fraude" : ""}.`
					: "",
			]
				.filter(Boolean)
				.join(" "),
			drivers: moves.slice(0, 5).map((m) => ({ label: DISPUTE_REASON_LABEL[m.k], value: m.a - m.b, detail: `${m.b} → ${m.a}` })),
			driverUnit: "cases",
			focus: { chart: "disputes", reason: top?.k },
			records: HISTORY.orders.filter((o) => ids.has(o.id)),
			weight: Math.abs(a.disputes.length - b.disputes.length) * 160,
		});
	}

	// Support: the slowest weekday against the rest.
	{
		const byDay = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ w, h: avg(a.tickets.filter((t) => t.weekday === w), (t) => t.resolveH), n: a.tickets.filter((t) => t.weekday === w).length }));
		const weekday = avg(byDay.filter((d) => d.w >= 1 && d.w <= 5), (d) => d.h);
		const weekend = byDay.filter((d) => d.w === 0 || d.w === 6);
		const wk = sum(weekend, (d) => d.h * d.n) / Math.max(1, sum(weekend, (d) => d.n));
		const n = sum(weekend, (d) => d.n);
		out.push({
			id: "support",
			// Weekend tickets waiting far longer is the finding, whichever way the average moved.
			tone: wk > weekday * 1.8 || a.resolveH > b.resolveH ? "bad" : "good",
			metric: "Klantenservice",
			figure: `${num(round1(wk))} u`,
			headline: `Weekendtickets zijn na gemiddeld ${num(round1(wk))} u opgelost, tegenover ${num(round1(weekday))} u doordeweeks.`,
			explain: `In ${A.label} kwamen ${plural(a.tickets.length, "ticket", "tickets")} binnen: gemiddeld eerste antwoord na ${num(a.firstH)} u en opgelost na ${num(a.resolveH)} u, tegenover ${num(b.resolveH)} u in ${B.label}. ${n} daarvan kwamen op zaterdag of zondag binnen, als er niemand dienst heeft, en die wachten tot maandag.`,
			drivers: byDay
				.slice(1)
				.concat(byDay.slice(0, 1))
				.map((d) => ({ label: cap(WEEKDAY[d.w]!), value: round1(d.h - a.resolveH), detail: `${num(round1(d.h))} u · ${d.n} ${d.n === 1 ? "ticket" : "tickets"}` })),
			driverUnit: "h",
			focus: { chart: "support", weekday: 6 },
			records: [],
			weight: n * 18,
			proposal: {
				title: "Weekendtickets meteen een eerste antwoord geven",
				body: "Een automatisering die weekendtickets binnen enkele minuten beantwoordt, met de status van de bestelling en wanneer een collega het oppakt.",
				why: `${n} weekendtickets wachtten deze periode gemiddeld ${num(round1(wk))} u; de meeste vragen waar een bestelling is, en dat kan het antwoord vertellen.`,
				confidence: 74,
				fileLabel: "Concept opstellen",
				action: { kind: "automation", template: "tpl_followup" },
			},
		});
	}

	// The best news: the store or channel that grew most.
	{
		const rows = breakdown(A, B, "channel");
		const best = [...rows].sort((x, y) => y.delta - x.delta)[0];
		const stores = breakdown(A, B, "store");
		const bestStore = [...stores].sort((x, y) => pct(y.a, y.b) - pct(x.a, x.b))[0];
		if (best && best.delta > 0) {
			out.push({
				id: "growth",
				tone: "good",
				metric: "Groei",
				figure: signed(Math.round(best.delta), money),
				headline: `Het kanaal ${best.label} bracht ${money(best.a)} op, ${signed(Math.round(pct(best.a, best.b)), (x) => `${x}%`)}; ${bestStore?.label} groeide het snelst van de winkels.`,
				explain: `Via dat kanaal kwam in ${A.label} ${money(best.a)} binnen, tegenover ${money(best.b)} in ${B.label}. ${bestStore ? `${bestStore.label} ging van ${money(bestStore.b)} naar ${money(bestStore.a)}, ${signed(Math.round(pct(bestStore.a, bestStore.b)), (x) => `${x}%`)}.` : ""}${bestStore?.key === "store_uk" ? " De Klaviyo-flows van die winkel lopen sinds 2 maart." : ""}`,
				drivers: rows.slice(0, 4).map((r) => ({ label: r.label, value: Math.round(r.delta) })),
				driverUnit: "$",
				focus: { chart: "revenue" },
				records: metrics(A).counted.filter((o) => o.channel === best.key),
				weight: best.delta * 0.6,
			});
		}
	}

	return out.sort((x, y) => y.weight - x.weight);
}

/* ── Cohorts and lead time ────────────────────────────────────────────────────────────── */

/** Of the customers whose first order fell in a month, the share who ordered again in each later month. */
export function cohorts() {
	const first = new Map<string, string>();
	for (const o of HISTORY.orders) if (o.firstOrder) first.set(o.customer, o.day.slice(0, 7));
	const months = MONTHS.map((m) => m.id);
	return months.slice(0, 4).map((m, i) => {
		const members = [...first].filter(([, fm]) => fm === m).map(([c]) => c);
		const set = new Set(members);
		const cells = months.slice(i + 1).map((later) => {
			const back = new Set(HISTORY.orders.filter((o) => !o.firstOrder && set.has(o.customer) && o.day.startsWith(later)).map((o) => o.customer));
			return { month: later, share: members.length === 0 ? 0 : (back.size / members.length) * 100, n: back.size };
		});
		return { month: m, size: members.length, cells };
	});
}

/** Every delivered order's lateness, by supplier: the dots of the lead-time strip. */
export function leadTimes(A: Span) {
	const m = metrics(A);
	return Object.keys(SUPPLIER_NAME)
		.map((s) => {
			const rows = m.delivered.filter((o) => o.supplier === s);
			return {
				key: s,
				label: SUPPLIER_NAME[s] ?? s,
				rows,
				late: rows.filter(isLate).length,
				median: rows.length === 0 ? 0 : [...rows].map((o) => o.took! - o.promised).sort((x, y) => x - y)[Math.floor(rows.length / 2)]!,
			};
		})
		.filter((s) => s.rows.length > 0);
}

export const WEEKDAYS = WEEKDAY;

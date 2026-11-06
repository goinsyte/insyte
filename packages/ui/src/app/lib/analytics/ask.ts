import {
	breakdown,
	cohorts,
	type Dim,
	findings,
	isLate,
	labelOf,
	metrics,
	money,
	MONTHS,
	num,
	round1,
	type Span,
	weekly,
	WEEKDAYS,
} from "./engine";
import { COUNTRY_IN, type Country, DISPUTE_REASON_LABEL, type HistOrder, REFUND_REASON_LABEL } from "./history";
import type { Token } from "../ask/scripts";

/**
 * Questions about the numbers, answered from the same rows the charts read. The mock is a
 * decision tree over the question's words, as Ask Insyte's is: it recognises what is being asked
 * about (refunds, a supplier, a country, a week) and computes the answer, a chart of it, and the
 * orders behind it. A question it cannot tie to the history says so and offers ones it can.
 */

export type AnswerChart = {
	title: string;
	unit: "$" | "%" | "h" | "#";
	rows: Array<{ label: string; a: number; b?: number }>;
	legend: [string, string?];
};

export type AskAnswer = {
	id: string;
	question: string;
	steps: string[];
	tokens: Token[];
	chart?: AnswerChart;
	records: HistOrder[];
	followUps: string[];
	understood: boolean;
};

export function toTokens(text: string): Token[] {
	return text.split(/(\s+)/).filter((w) => w !== "").map((t) => ({ t }));
}

const COUNTRY_WORDS: ReadonlyArray<[RegExp, Country]> = [
	[/\bgerman(y)?\b|\bduits(land|e)?\b/, "DE"],
	[/\bfran(ce|ch)\b|\bfr\b|\bfrankrijk\b|\bfranse?\b/, "FR"],
	[/\bnetherlands\b|\bdutch\b|\bholland\b|\bnl\b|\bnederland(s|se)?\b/, "NL"],
	[/\bspa(in|nish)\b|\bes\b|\bspanje\b|\bspaanse?\b/, "ES"],
	[/\buk\b|\bbrit(ain|ish)\b|\bunited kingdom\b|\bgb\b|\bverenigd koninkrijk\b|\bengeland\b|\bvk\b|\bbritse?\b/, "GB"],
	[/\bus\b|\busa\b|\bamerica(n)?\b|\bunited states\b|\bverenigde staten\b|\bamerika(anse?)?\b/, "US"],
];

export const SUGGESTED = [
	"Waarom veranderde de omzet?",
	"Welke leverancier is het vaakst te laat?",
	"Waarom zijn er meer terugbetalingen?",
	"Welk kanaal groeide het meest?",
	"Komen klanten terug?",
	"Wanneer zijn tickets het traagst?",
];
const [REVENUE_Q, SUPPLIER_Q, REFUNDS_Q, CHANNEL_Q, RETENTION_Q, TICKETS_Q] = SUGGESTED as [string, string, string, string, string, string];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function ask(question: string, A: Span, B: Span): AskAnswer {
	const q = question.toLowerCase();
	const a = metrics(A);
	const b = metrics(B);
	const id = `ans_${Date.now().toString(36)}`;
	const country = COUNTRY_WORDS.find(([re]) => re.test(q))?.[1];
	const inCountry = (xs: HistOrder[]) => (country ? xs.filter((o) => o.country === country) : xs);
	const where = country ? ` in ${COUNTRY_IN[country]}` : "";
	const legend: [string, string] = [A.short, B.short];
	const base = { id, question, understood: true };

	if (/refund|return|came back|sent back|terugbetal|retour|teruggestuurd|teruggekomen|kwam(en)? terug|terugkwam/.test(q)) {
		const ra = inCountry(a.refunds);
		const rb = inCountry(b.refunds);
		const reasons = [...new Set([...ra, ...rb].map((o) => o.refundReason!))];
		const rows = reasons
			.map((r) => ({ key: r, label: REFUND_REASON_LABEL[r], a: ra.filter((o) => o.refundReason === r).length, b: rb.filter((o) => o.refundReason === r).length }))
			.sort((x, y) => y.a - x.a);
		const top = [...rows].sort((x, y) => y.a - y.b - (x.a - x.b))[0];
		const byProduct = new Map<string, number>();
		for (const o of ra.filter((o) => o.refundReason === top?.key)) byProduct.set(o.title, (byProduct.get(o.title) ?? 0) + 1);
		const [prod, n] = [...byProduct].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
		const ordersA = inCountry(a.orders).length;
		const text = `In ${A.label} ${ra.length === 1 ? "kwam" : "kwamen"} ${plural(ra.length, "bestelling", "bestellingen")}${where} terug, ${num(round1((ra.length / Math.max(1, ordersA)) * 100))}% van de bestellingen, tegenover ${rb.length} in ${B.label}. ${top ? `De reden die het meest groeide is “${top.label}”, ${top.b} → ${top.a}${n > 1 ? `, en ${n} daarvan zijn ${prod}` : ""}.` : ""}${prod === "Trailhead korte broek" && top?.key === "Wrong size" ? " De partij die op 20 april binnenkwam, valt een maat te klein." : ""}`;
		return {
			...base,
			steps: [`${num(ra.length + rb.length)} terugbetalingen${where} gelezen`, "Op reden gegroepeerd", "De twee periodes vergeleken"],
			tokens: toTokens(text),
			chart: { title: `Terugbetalingen per reden${where}`, unit: "#", rows, legend },
			records: ra.filter((o) => o.refundReason === top?.key),
			followUps: [SUPPLIER_Q, REVENUE_Q],
		};
	}

	if (
		/supplier|late|slow(est)? (to )?deliver|deliver|on.?time|lead.?time|shipping|customs|leverancier|te laat|later|lever(ing|t|en|tijd)|bezorg|op tijd|verzend|verzonden|douane/.test(q) &&
		!/ticket|support|repl|klantenservice|antwoord|beantwo/.test(q)
	) {
		const sup = (m: typeof a, s: string) => {
			const rows = inCountry(m.delivered).filter((o) => o.supplier === s);
			return rows.length === 0 ? 0 : (rows.filter(isLate).length / rows.length) * 100;
		};
		const keys = [...new Set(a.delivered.map((o) => o.supplier))];
		const rows = keys.map((k) => ({ label: labelOf("supplier", k), key: k, a: round1(sup(a, k)), b: round1(sup(b, k)) })).sort((x, y) => y.a - x.a);
		const worst = rows[0];
		const lateRows = inCountry(a.delivered).filter((o) => o.supplier === worst?.key && isLate(o));
		const byCountry = new Map<string, number>();
		for (const o of lateRows) byCountry.set(o.country, (byCountry.get(o.country) ?? 0) + 1);
		const [c, n] = [...byCountry].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
		const text = `${worst?.label} is het vaakst te laat${where}: in ${A.label} kwam ${num(worst?.a ?? 0)}% van de pakketten na de beloofde datum aan, tegenover ${num(worst?.b ?? 0)}% in ${B.label}. ${!country && n > 0 ? `${n} van de ${lateRows.length} te late pakketten ${n === 1 ? "ging" : "gingen"} naar ${COUNTRY_IN[c as Country]}.` : ""}${worst?.key === "sup_kestrel" && (c === "DE" || country === "DE") ? " Sinds 1 mei wachten ze zo'n drie dagen tussen de overdracht en de eerste scan van de vervoerder." : ""}`;
		return {
			...base,
			steps: [`${num(inCountry(a.delivered).length)} leveringen${where} gelezen`, "Elke levering naast de beloofde datum gelegd", "De leveranciers gerangschikt"],
			tokens: toTokens(text),
			chart: { title: `Te late pakketten per leverancier${where}`, unit: "%", rows, legend },
			records: lateRows,
			followUps: [REFUNDS_Q, TICKETS_Q],
		};
	}

	if (/dispute|chargeback|fraud|geschil|fraude/.test(q)) {
		const reasons = [...new Set([...a.disputes, ...b.disputes].map((d) => d.reason))];
		const rows = reasons
			.map((r) => ({ label: DISPUTE_REASON_LABEL[r], a: a.disputes.filter((d) => d.reason === r).length, b: b.disputes.filter((d) => d.reason === r).length }))
			.sort((x, y) => y.a - x.a);
		const f = findings(A, B).find((x) => x.id === "disputes");
		return {
			...base,
			steps: [`${num(a.disputes.length + b.disputes.length)} geschillen gelezen`, "Elk geschil aan zijn bestelling en levering gekoppeld"],
			tokens: toTokens(`${f?.headline ?? ""} ${f?.explain ?? ""}`),
			chart: { title: "Geschillen per reden", unit: "#", rows, legend },
			records: f?.records ?? [],
			followUps: [SUPPLIER_Q],
		};
	}

	if (/ticket|support|repl(y|ies)|resol|response|weekend|wait|klantenservice|antwoord|reactie|opgelost|oplos|wacht/.test(q)) {
		const day = (m: typeof a, w: number) => {
			const t = m.tickets.filter((x) => x.weekday === w);
			return t.length === 0 ? 0 : round1(t.reduce((n, x) => n + x.resolveH, 0) / t.length);
		};
		const order = [1, 2, 3, 4, 5, 6, 0];
		const rows = order.map((w) => ({ label: cap(WEEKDAYS[w]!.slice(0, 2)), a: day(a, w), b: day(b, w) }));
		const f = findings(A, B).find((x) => x.id === "support");
		return {
			...base,
			steps: [`${num(a.tickets.length)} tickets gelezen`, "Bij elk ticket de tijd tot opgelost gemeten", "Gegroepeerd op de dag van binnenkomst"],
			tokens: toTokens(`${f?.headline ?? ""} ${f?.explain ?? ""}`),
			chart: { title: "Uren tot opgelost, per dag van binnenkomst", unit: "h", rows, legend },
			records: [],
			followUps: [REVENUE_Q],
		};
	}

	if (/repeat|retention|cohort|come back|returning|loyal|again|terugkom|terugkerend|komen .*terug|keren .*terug|herhaal|trouw|opnieuw|nog eens|weer bestel/.test(q)) {
		const c = cohorts();
		const abbr = (m: string) => MONTHS.find((x) => x.id === m)?.abbr ?? m;
		const rows = c.map((x) => ({ label: `Klanten ${abbr(x.month)}`, a: round1(x.cells[0]?.share ?? 0) }));
		const best = [...c].sort((x, y) => (y.cells[0]?.share ?? 0) - (x.cells[0]?.share ?? 0))[0];
		const bestMonth = (MONTHS.find((x) => x.id === best?.month)?.label ?? "").toLowerCase();
		const text = `Van de klanten die in een maand voor het eerst bestelden, bestelde ${num(round1(Math.min(...rows.map((r) => r.a))))}% tot ${num(round1(Math.max(...rows.map((r) => r.a))))}% de maand erna opnieuw. De ${num(best?.size ?? 0)} nieuwe klanten van ${bestMonth} kwamen het vaakst terug, en ${num(round1(best?.cells.at(-1)?.share ?? 0))}% van hen bestelde in mei nog steeds.`;
		return {
			...base,
			steps: ["De eerste bestelling van elke klant gevonden", "Per maand geteld wie opnieuw bestelde"],
			tokens: toTokens(text),
			chart: { title: "Opnieuw besteld in de maand erna", unit: "%", rows, legend: ["Aandeel van het cohort"] },
			records: [],
			followUps: [CHANNEL_Q],
		};
	}

	const dimWord: Array<[RegExp, Dim, string]> = [
		[/channel|ads?\b|meta|klaviyo|google|organic|marketing|kana(a|le)l|advertentie|organisch/, "channel", "kanaal"],
		[/product|best.?sell|top|item|sku|artikel/, "product", "product"],
		[/store|shop|winkel/, "store", "winkel"],
		[/countr|market|where|\bland(en)?\b|\bmarkt(en)?\b|\bwaar\b/, "country", "land"],
	];
	const dim = dimWord.find(([re]) => re.test(q)) ?? (country ? ([/./, "country", "land"] as const) : undefined);
	if (dim) {
		const rows = breakdown(A, B, dim[1], undefined, (m) => inCountry(m.orders)).slice(0, 8);
		const grew = [...rows].sort((x, y) => y.delta - x.delta)[0];
		const fell = [...rows].sort((x, y) => x.delta - y.delta)[0];
		const text = `Per ${dim[2]}${where} groeide ${grew?.label} het meest, ${money(grew?.b ?? 0)} → ${money(grew?.a ?? 0)}${fell && fell.delta < 0 ? `, en daalde ${fell.label} het meest, ${money(fell.b)} → ${money(fell.a)}` : ""}.${grew?.key === "store_uk" || grew?.key === "Klaviyo" ? " De Klaviyo-flows van de UK-winkel lopen sinds 2 maart." : ""}`;
		return {
			...base,
			steps: [`${num(inCountry(a.orders).length + inCountry(b.orders).length)} bestellingen${where} gelezen`, `Omzet per ${dim[2]} gegroepeerd`],
			tokens: toTokens(text),
			chart: { title: `Omzet per ${dim[2]}${where}`, unit: "$", rows: rows.map((r) => ({ label: r.label, a: r.a, b: r.b })), legend },
			records: inCountry(a.counted).filter((o) => grew && (dim[1] === "product" ? o.product : dim[1] === "store" ? o.store : dim[1] === "channel" ? o.channel : o.country) === grew.key),
			followUps: [REVENUE_Q, RETENTION_Q],
		};
	}

	if (/best|busiest|peak|week|day|drukst|piek|\bdag(en)?\b/.test(q)) {
		const w = weekly(A, B).filter((x) => !Number.isNaN(x.revenue));
		const best = [...w].sort((x, y) => y.revenue - x.revenue)[0];
		return {
			...base,
			steps: ["De omzet per week opgeteld"],
			tokens: toTokens(`De beste week van ${A.label} was dag ${best?.label}, met ${money(best?.revenue ?? 0)}, tegenover ${money(best?.revenuePrev ?? 0)} in dezelfde dagen van ${B.label}.`),
			chart: { title: "Omzet per week", unit: "$", rows: w.map((x) => ({ label: x.label, a: x.revenue, b: x.revenuePrev })), legend },
			records: [],
			followUps: [CHANNEL_Q],
		};
	}

	if (/revenue|sales|money|earn|why|down|up|change|grow|drop|fell|omzet|verko(op|cht|pen)|geld|verdien|waarom|daal|stijg|steeg|verander|groei|gezakt|lager|hoger/.test(q)) {
		const f = findings(A, B).find((x) => x.id === "revenue");
		const rows = breakdown(A, B, "store");
		return {
			...base,
			steps: [`${num(a.counted.length + b.counted.length)} betaalde bestellingen gelezen`, "Het verschil gesplitst in volume en bestelgrootte", "De grootste verschuivingen gevonden"],
			tokens: toTokens(`${f?.headline ?? ""} ${f?.explain ?? ""}`),
			chart: { title: "Omzet per winkel", unit: "$", rows: rows.map((r) => ({ label: r.label, a: r.a, b: r.b })), legend },
			records: f?.records ?? [],
			followUps: [CHANNEL_Q, SUPPLIER_Q],
		};
	}

	return {
		...base,
		understood: false,
		steps: ["Gezocht waar de vraag over gaat"],
		tokens: toTokens(
			`Dat kan ik met deze cijfers nog niet beantwoorden. Ik lees de bestellingen, leveringen, terugbetalingen, geschillen en tickets van ${A.label} en ${B.label}, per winkel, land, product, leverancier en kanaal. Probeer een van deze.`,
		),
		records: [],
		followUps: SUGGESTED.slice(0, 4),
	};
}

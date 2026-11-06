import { formatCurrency } from "../format";
import { supplierName } from "../order-supplier";
import type { OrderStatus } from "../types/domain";
import { useWorkspace } from "../../stores/workspace-store";

/*
 * What Ask Insyte says, while the model is mocked.
 *
 * Every answer is a script read from the live workspace at the moment the question is asked, so the
 * numbers in it and the records it names are the ones on screen elsewhere — file the Klarna case on
 * the queue and Ask Insyte stops proposing it. A script is the whole turn: the steps it thinks
 * through, the tools it ran, the answer (words, and records as chips), the sources it read, at most
 * one proposal for the operator to file or discard, and the follow-ups.
 *
 * Nothing here pretends to be a model. The mock is a decision tree over the question's words, a
 * leading slash command, or a mentioned record, and says plainly when it has nothing to go on.
 */

export type RefKind = "order" | "chargeback" | "ticket" | "customer" | "supplier" | "store";
export type Token = { t: string } | { ref: string; to: string; kind: RefKind };

export type ProposalAction =
	| { kind: "file-queue"; queueId: string; label: string }
	| { kind: "supplier-ticket"; supplier: string; orders: ReadonlyArray<string> }
	| { kind: "send-reply"; to: string; body: string }
	| { kind: "open"; to: string };

export type Proposal = {
	title: string;
	body: string;
	/** 0–100. Shown as a measured bar, never as a bare percentage. */
	confidence: number;
	why: string;
	fileLabel: string;
	action: ProposalAction;
};

export type Source = { kind: RefKind | "queue"; title: string; detail: string; to: string };
export type Tool = { verb: string; object: string };

export type Script = {
	steps: ReadonlyArray<string>;
	tools: ReadonlyArray<Tool>;
	answer: ReadonlyArray<Token>;
	sources: ReadonlyArray<Source>;
	proposal?: Proposal;
	followUps: ReadonlyArray<string>;
};

export const COMMANDS: ReadonlyArray<{ name: string; hint: string; prompt: string }> = [
	{ name: "samenvatten", hint: "Wat vandaag op jou wacht", prompt: "Vat de open zaken van vandaag samen" },
	{ name: "vertragingen", hint: "Bestellingen die te laat dreigen te komen", prompt: "Welke bestellingen dreigen te laat te komen?" },
	{ name: "opstellen", hint: "Een antwoord aan een klant", prompt: "Stel een antwoord op aan Daniel over zijn vertraagde levering" },
	{ name: "chargebacks", hint: "Zaken die op bewijs wachten", prompt: "Welke chargebacks hebben bewijs nodig?" },
];

/** `[[label|/to|kind]]` in a sentence becomes a record chip; the rest is words. */
function say(text: string): Token[] {
	const out: Token[] = [];
	for (const part of text.split(/(\[\[[^\]]+\]\])/)) {
		const m = /^\[\[([^|]+)\|([^|]+)\|([a-z]+)\]\]$/.exec(part);
		if (m) out.push({ ref: m[1] ?? "", to: m[2] ?? "/", kind: (m[3] ?? "order") as RefKind });
		else for (const w of part.split(/(\s+)/)) if (w !== "") out.push({ t: w });
	}
	return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const STATUS: Record<OrderStatus, string> = {
	placed: "geplaatst",
	paid: "betaald",
	at_supplier: "bij leverancier",
	shipped: "verzonden",
	delivered: "bezorgd",
	cancelled: "geannuleerd",
	refunded: "terugbetaald",
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function scriptFor(question: string): Script {
	const q = question.trim().toLowerCase();
	const mention = /@([a-z]{2,4}-\d{3,6}|#\d{3,6})/i.exec(question)?.[1];
	if (mention) return aboutRecord(mention);
	if (q.startsWith("/")) {
		const cmd = COMMANDS.find((c) => q.startsWith(`/${c.name}`));
		if (cmd) return scriptFor(cmd.prompt);
	}
	if (/(summar|samenvat|vat .*samen|today|vandaag|open issue|open zaken|needs? me|wacht op mij|what.*(do|first)|wat (moet|eerst))/.test(q)) return summary();
	if (/(late|laat|risk|risico|dreig|delay|vertra|supplier|leverancier|shipping|levering|verzend)/.test(q) && !/(draft|reply|antwoord|opstel|stel .*op)/.test(q)) return delays();
	if (/(draft|reply|write|antwoord|opstel|stel .*op|schrijf|daniel|customer|klant)/.test(q)) return reply();
	if (/(chargeback|dispute|geschil|klarna|evidence|bewijs)/.test(q)) return chargebacks();
	return nothing(question);
}

function summary(): Script {
	const s = useWorkspace.getState();
	const open = s.queue.filter((r) => r.state === "open" && (r.signal === "red" || r.signal === "amber"));
	const klarna = s.queue.find((r) => r.id === "q_cb_2214" && r.state === "open");
	const delayed = s.orders.filter((o) => o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded");
	const evidence = s.chargebacks.filter((c) => c.status === "open" || c.status === "awaiting_evidence");
	const high = s.tickets.filter((t) => t.priority === "high" && t.status !== "done");

	const lead = klarna
		? `De zaak met een deadline is [[DSP-2214|/chargebacks|chargeback]]: het bewijs voor Klarna moet om 18:00 binnen zijn en het bewijspakket is al verzameld. `
		: "De Klarna-zaak is ingediend, dus de komende uren loopt er geen deadline af. ";
	return {
		steps: ["Wachtrij van vandaag lezen", "Deadlines van open zaken controleren", "De rest groeperen op wie moet handelen"],
		tools: [
			{ verb: "Las", object: plural(s.queue.length, "wachtrijregel", "wachtrijregels") },
			{ verb: "Las", object: plural(evidence.length, "open zaak", "open zaken") },
			{ verb: "Las", object: plural(delayed.length, "vertraagde bestelling", "vertraagde bestellingen") },
		],
		answer: say(
			`${plural(open.length, "zaak wacht", "zaken wachten")} op jou voordat de dag om is. ${lead}Verder zijn er ${plural(delayed.length, "vertraagde bestelling", "vertraagde bestellingen")}, de meeste bij [[Skyway Freight|/orders|supplier]], en staan er nog ${plural(high.length, "ticket", "tickets")} met hoge prioriteit open op het bord.`,
		),
		sources: [
			{ kind: "queue", title: "Wachtrij van vandaag", detail: `${open.length} wachten op jou`, to: "/dashboard" },
			{ kind: "chargeback", title: "DSP-2214 · Klarna", detail: "Bewijs uiterlijk 18:00", to: "/chargebacks" },
			{ kind: "supplier", title: "Skyway Freight", detail: `${delayed.length} vertraagd`, to: "/orders" },
		],
		proposal: klarna
			? {
					title: "Klarna-bewijs voor DSP-2214 indienen",
					body: "Vier documenten verzameld: de scan van de vervoerder, de bezorgfoto, twee antwoorden van de klant en de oorspronkelijke factuur.",
					confidence: 92,
					why: "Klarna heeft dit jaar elke zaak met een scan van de vervoerder in het voordeel van de verkoper beslist.",
					fileLabel: "Bewijs indienen",
					action: { kind: "file-queue", queueId: "q_cb_2214", label: "DSP-2214 ingediend bij Klarna" },
				}
			: undefined,
		followUps: ["Welke bestellingen dreigen te laat te komen?", "Stel een antwoord op aan Daniel over zijn vertraagde levering"],
	};
}

function delays(): Script {
	const s = useWorkspace.getState();
	const delayed = s.orders.filter((o) => o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded");
	const by = new Map<string, string[]>();
	for (const o of delayed) by.set(supplierName(o.id), [...(by.get(supplierName(o.id)) ?? []), o.number]);
	const [worst, numbers] = [...by].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
	const first = numbers.slice(0, 3);
	return {
		steps: ["Bestellingen voorbij hun overdrachtsdatum zoeken", "Elke bestelling aan haar leverancier koppelen", "Leveranciers rangschikken op aantal"],
		tools: [
			{ verb: "Las", object: plural(s.orders.length, "bestelling", "bestellingen") },
			{ verb: "Koppelde", object: plural(by.size, "leverancier", "leveranciers") },
		],
		answer: say(
			delayed.length === 0
				? "Er is nu geen bestelling voorbij haar overdrachtsdatum."
				: `${plural(delayed.length, "bestelling dreigt", "bestellingen dreigen")} te laat te komen. [[${worst}|/orders|supplier]] heeft er ${numbers.length} van, waaronder ${first.map((n) => `[[${n}|/orders|order]]`).join(", ")}. Geen ervan heeft al een nieuwe overdrachtsdatum, dus de klanten weten nog van niets.`,
		),
		sources: [
			{ kind: "supplier", title: worst, detail: `${numbers.length} vertraagd`, to: "/orders" },
			...first.map((n) => ({ kind: "order" as const, title: n, detail: "Voorbij overdracht", to: "/orders" })),
		],
		proposal:
			numbers.length > 0
				? {
						title: `Vraag ${worst} om nieuwe overdrachtsdata`,
						body: `Eén follow-up voor alle ${numbers.length} bestellingen, geopend als ticket zodat het antwoord op het bord terechtkomt.`,
						confidence: 84,
						why: `${worst} beantwoordde de laatste drie follow-ups binnen een dag.`,
						fileLabel: "Ticket openen",
						action: { kind: "supplier-ticket", supplier: worst, orders: numbers },
					}
				: undefined,
		followUps: ["Stel een antwoord op aan Daniel over zijn vertraagde levering", "Vat de open zaken van vandaag samen"],
	};
}

function reply(): Script {
	const body =
		"Hoi Daniel, bedankt voor je geduld. Je bestelling is later dan gepland bij onze leverancier vertrokken en ligt nu bij de vervoerder. De track & trace wordt binnen een dag bijgewerkt en ik laat het je weten zodra dat gebeurt.";
	return {
		steps: ["Daniels laatste twee berichten lezen", "Nagaan waar zijn bestelling is", "Schrijven in de toon van de winkel"],
		tools: [
			{ verb: "Las", object: "2 berichten" },
			{ verb: "Las", object: "1 track & trace-update" },
		],
		answer: say(
			"Daniel schreef twee keer over [[SO-12224|/orders|order]]. De bestelling ligt bij de vervoerder, een dag achter, en er valt nog geen terugbetaling aan te bieden omdat ze niet kwijt is. Hier is een antwoord dat dat zegt zonder een datum te beloven.",
		),
		sources: [
			{ kind: "customer", title: "Daniel Okafor", detail: "2 berichten, laatste 3 uur geleden", to: "/inbox" },
			{ kind: "order", title: "SO-12224", detail: "Bij de vervoerder", to: "/orders" },
		],
		proposal: {
			title: "Daniel beantwoorden",
			body,
			confidence: 78,
			why: "Klanten die over een vertraging hoorden voordat ze ernaar vroegen, openden vorig kwartaal minder geschillen.",
			fileLabel: "Antwoord versturen",
			action: { kind: "send-reply", to: "Daniel Okafor", body },
		},
		followUps: ["Welke bestellingen dreigen te laat te komen?", "Welke chargebacks hebben bewijs nodig?"],
	};
}

function chargebacks(): Script {
	const s = useWorkspace.getState();
	const open = s.chargebacks
		.filter((c) => c.status === "open" || c.status === "awaiting_evidence")
		.sort((a, b) => Date.parse(a.deadline_at) - Date.parse(b.deadline_at));
	const atStake = open.reduce((n, c) => n + c.amount, 0);
	return {
		steps: ["Zaken zoeken die op bewijs wachten", "Sorteren op deadline"],
		tools: [{ verb: "Las", object: plural(s.chargebacks.length, "zaak", "zaken") }],
		answer: say(
			open.length === 0
				? "Er wacht geen zaak op bewijs."
				: `${plural(open.length, "zaak heeft", "zaken hebben")} bewijs nodig, ${formatCurrency(atStake)} in totaal. De eerste deadline is ${open
						.slice(0, 2)
						.map((c) => `[[${c.case_number}|/chargebacks|chargeback]] van ${c.customer_name}`)
						.join(", daarna ")}.`,
		),
		sources: open.slice(0, 3).map((c) => ({ kind: "chargeback" as const, title: c.case_number, detail: c.reason, to: "/chargebacks" })),
		proposal:
			open.length > 0
				? {
						title: "Zaken openen op volgorde van deadline",
						body: "De lijst met chargebacks, gesorteerd zodat de eerstvolgende deadline bovenaan staat.",
						confidence: 96,
						why: "Er verandert niets tot je een zaak opent.",
						fileLabel: "Chargebacks openen",
						action: { kind: "open", to: "/chargebacks" },
					}
				: undefined,
		followUps: ["Vat de open zaken van vandaag samen"],
	};
}

function aboutRecord(ref: string): Script {
	const s = useWorkspace.getState();
	const order = s.orders.find((o) => o.number.toLowerCase() === ref.toLowerCase());
	const cb = s.chargebacks.find((c) => c.case_number.toLowerCase() === ref.toLowerCase());
	if (order) {
		const supplier = supplierName(order.id);
		const late = order.tags.includes("at_risk");
		return {
			steps: [`${order.number} openen`, "Leverancier en track & trace lezen"],
			tools: [{ verb: "Las", object: order.number }],
			answer: say(
				`[[${order.number}|/orders/${order.id}|order]] is ${formatCurrency(order.total, order.currency)} van [[${order.customer_name}|/customers|customer]], ${STATUS[order.status]}, bij [[${supplier}|/orders|supplier]].${late ? " De overdrachtsdatum is al verstreken." : " De bestelling is op tijd."}`,
			),
			sources: [{ kind: "order", title: order.number, detail: capital(STATUS[order.status]), to: `/orders/${order.id}` }],
			proposal: late
				? {
						title: `Vraag ${supplier} naar ${order.number}`,
						body: "Een follow-up over alleen deze bestelling, geopend als ticket.",
						confidence: 81,
						why: "Het is de enige open vraag bij deze bestelling.",
						fileLabel: "Ticket openen",
						action: { kind: "supplier-ticket", supplier, orders: [order.number] },
					}
				: undefined,
			followUps: ["Welke bestellingen dreigen te laat te komen?"],
		};
	}
	if (cb) return chargebacks();
	return nothing(ref);
}

function nothing(question: string): Script {
	return {
		steps: ["Uitzoeken waar dit over gaat"],
		tools: [],
		answer: say(
			`Ik kon “${question.trim().slice(0, 60)}” niet koppelen aan een bestelling, zaak, ticket of leverancier. Vermeld een record met @, of begin met een van deze.`,
		),
		sources: [],
		followUps: COMMANDS.slice(0, 3).map((c) => c.prompt),
	};
}

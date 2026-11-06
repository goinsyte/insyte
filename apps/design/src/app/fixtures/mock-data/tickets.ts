import { byScenario, longName } from "../scenario";
import type { Ticket } from "@insyte/ui/app/lib/types/domain";

const T: Array<Omit<Ticket, "id" | "number" | "created_at" | "updated_at">> = [
	{
		title: "Klant gaf feedback op SO-12345",
		description:
			"De klant gaf de levering een 3/5 en meldde dat het pakket licht beschadigd aankwam.",
		status: "intake",
		priority: "medium",
		tags: ["Productontwerp", "Feedback"],
		assignee_ids: ["e", "s", "l", "m"],
		related_entity: { type: "order", id: "ord_5012", label: "SO-12345" },
	},
	{
		title: "Klant tevreden met oplossing voor SO-12340",
		description: "Opgelost met een vervangend artikel, klant is tevreden.",
		status: "in_progress",
		priority: "medium",
		tags: ["Klantenservice"],
		assignee_ids: ["s"],
		related_entity: { type: "order", id: "ord_5008", label: "SO-12340" },
	},
	{
		title: "Leverancier wacht op bevestiging voor SO-12943",
		description: "Allure vraagt welke vervoerder we willen voordat ze verzenden.",
		status: "awaiting_reply",
		priority: "medium",
		tags: ["Leveringsketen", "Bestelbevestiging"],
		assignee_ids: ["e", "l"],
		related_entity: { type: "order", id: "ord_5021", label: "SO-12943" },
	},
	{
		title: "Bewijs voor Klarna-chargeback ingediend",
		description: "Bewijspakket DSP-2204 is ingediend.",
		status: "done",
		priority: "high",
		tags: ["Geschillen"],
		assignee_ids: ["e", "l"],
		related_entity: { type: "chargeback", id: "cb_2204", label: "DSP-2204" },
	},
	{
		title: "Klant gaf feedback op SO-12345",
		description: "Vervolgbericht van de klant.",
		status: "intake",
		priority: "medium",
		tags: ["Productontwerp"],
		assignee_ids: ["e", "s"],
	},
	{
		title: "Klant tevreden met oplossing voor SO-12340",
		description: "Afgerond.",
		status: "in_progress",
		priority: "low",
		tags: ["Klantenservice", "Opgelost"],
		assignee_ids: ["s"],
	},
	{
		title: "Leverancier wacht op bevestiging voor SO-12943",
		description: "Wacht op antwoord van de vervoerder.",
		status: "awaiting_reply",
		priority: "medium",
		tags: ["Leveringsketen", "Bestelbevestiging"],
		assignee_ids: ["e", "l"],
	},
	{
		title: "SO-12881 terugbetaald",
		description: "$48 · terugbetaling via PayPal gestart.",
		status: "done",
		priority: "high",
		tags: ["Terugbetalingen"],
		assignee_ids: ["m"],
	},
	{
		title: "Klant gaf feedback op SO-12345",
		description: "Review uit ronde 3.",
		status: "intake",
		priority: "medium",
		tags: ["Productontwerp"],
		assignee_ids: ["e", "s"],
	},
	{
		title: "Inkomende chat > 24 uur onbeantwoord",
		description:
			"Een chat van een groothandelslead is al meer dan een dag niet beantwoord.",
		status: "intake",
		priority: "high",
		tags: ["Klantenservice"],
		assignee_ids: ["e"],
	},
	{
		title: "Lage voorraad: Aurora fleece met capuchon",
		description: "Minder dan 10 stuks over alle varianten.",
		status: "intake",
		priority: "high",
		tags: ["Leveringsketen", "Voorraad"],
		assignee_ids: ["l"],
	},
	{
		title: "Producttekst naar het Frans vertalen",
		description: "De beschrijvingen van de Cascade pufferjas en het Coastline bomberjack moeten in het Frans.",
		status: "in_progress",
		priority: "low",
		tags: ["Productontwerp", "Vertaling"],
		assignee_ids: ["m"],
	},
];

const BUSY: typeof T = Array.from({ length: 60 }, (_, i) => ({
	title: `${longName(i)} vraagt waar bestelling SO-${12200 + ((i * 7) % 60)} blijft, die volgens de bevestiging al vorige week geleverd had moeten zijn`,
	description: "Klant mailde twee keer en belde één keer. Track-and-trace staat al vijf dagen op \u201cin transit\u201d.",
	status: (["intake", "in_progress", "awaiting_reply", "intake"] as const)[i % 4]!,
	priority: (["high", "medium", "low", "high"] as const)[i % 4]!,
	tags: ["Klantenservice", "Levering"],
	assignee_ids: i % 3 === 0 ? [] : ["e"],
}));

const build = (rows: typeof T): Ticket[] => rows.map((t, i) => ({
	...t,
	id: `tkt_${4000 + i}`,
	number: `TKT-${String(900 + i).padStart(4, "0")}`,
	created_at: `2026-05-${String(15 + (i % 7)).padStart(2, "0")}T10:${String(i * 5).padStart(2, "0")}:00Z`,
	updated_at: `2026-05-${String(20 + (i % 3)).padStart(2, "0")}T11:00:00Z`,
}));

export const tickets: Ticket[] = byScenario({ empty: [], settled: build(T), busy: () => build([...T, ...BUSY]) });

export const TICKET_COLUMNS = [
	{ id: "intake" as const, label: "Nieuw" },
	{ id: "in_progress" as const, label: "Bezig" },
	{ id: "awaiting_reply" as const, label: "Wacht op antwoord" },
	{ id: "done" as const, label: "Klaar · vandaag" },
];

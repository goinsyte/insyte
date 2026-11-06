import { byScenario } from "../scenario";
export type AiFocusItem = {
	id: string;
	priority: "high" | "medium" | "low";
	title: string;
	subtitle: string;
	action: { label: string; href?: string };
	chip: string;
};

const SEED_TODAYSFOCUS: AiFocusItem[] = [
	{
		id: "focus_1",
		priority: "high",
		title: "3 bestellingen dreigen te laat te komen",
		subtitle:
			"Leverancier Allure verwacht vertraging op SKU-2148. Dit raakt 3 openstaande bestellingen.",
		action: { label: "Leveranciersbestelling openen", href: "/orders" },
		chip: "Leveranciersbestelling openen",
	},
	{
		id: "focus_2",
		priority: "medium",
		title: "Sjabloon voor terugbetalingen presteert onder de maat",
		subtitle:
			'Klanten reageren 18% minder op het sjabloon "Terugbetaling" dan op een gemiddeld sjabloon.',
		action: { label: "Nu bekijken", href: "/automations/auto_2" },
		chip: "Nu bekijken",
	},
	{
		id: "focus_3",
		priority: "high",
		title: "Bewijs voor Klarna-chargeback klaar",
		subtitle:
			"4 documenten automatisch verzameld voor DSP-2204, met een zekerheid van 4,2. Dien in wanneer je klaar bent.",
		action: { label: "Nu indienen", href: "/chargebacks/cb_2214" },
		chip: "Nu indienen",
	},
];

export const todaysFocus: AiFocusItem[] = byScenario({ empty: [], settled: SEED_TODAYSFOCUS });

export const askInsyteWelcome = [
	{
		role: "assistant" as const,
		content:
			"Hoi Elena · ik heb de wachtrij van vandaag doorgenomen. 3 bestellingen hebben aandacht nodig en een bewijspakket voor Klarna staat klaar om in te dienen. Waar wil je mee beginnen?",
	},
];

export const askInsyteSuggestions = [
	"Vat de open zaken van vandaag samen",
	"Welke bestellingen dreigen te laat te komen?",
	"Stel een antwoord op aan Daniel over zijn vertraagde levering",
	"Open de chargebacks",
];

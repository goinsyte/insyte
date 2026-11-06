import type { OnboardingPersona } from "./use-onboarding-state";

/*
 * What the brand half says at each step.
 *
 * The form half asks; this half says why it is worth answering, in the same voice as /login. Each
 * line is a headline with one word or phrase in arc, and one sentence under it. Nothing here adds a
 * claim the step itself does not make: the plan line repeats the trial the plan step offers, the
 * store line repeats what the Shopify step says it reads.
 *
 * Keyed by persona and step id, because two tails reuse the same ids ("profile", "ready").
 */
export type BrandLine = { lead: string; accent: string; tail?: string; body: string };

const BOOKEND: BrandLine = {
	lead: "Standaard stil.",
	accent: "Luid",
	tail: "als het ertoe doet.",
	body: "Het besturingssysteem voor dropshippers. Bestellingen, klantenservice, leveranciers, chargebacks en automatiseringen in één commandocentrum.",
};

const HEAD: Record<string, BrandLine> = {
	account: BOOKEND,
	verify: {
		lead: "Eén link,",
		accent: "dan",
		tail: "ben je binnen.",
		body: "Door hem te openen bevestig je dat het adres van jou is. Het is de enige e-mail die we sturen voordat je bent ingericht.",
	},
	role: {
		lead: "Drie manieren.",
		accent: "Kies",
		tail: "jouw kant van de bestelling.",
		body: "Winkeleigenaren runnen hier hun zaak, leveranciers verwerken de bestellingen, affiliates brengen de kopers. Je kunt later wisselen in de instellingen.",
	},
};

const TAILS: Record<OnboardingPersona, Record<string, BrandLine>> = {
	admin: {
		organization: {
			lead: "Eén werkruimte",
			accent: "voor",
			tail: "de hele winkel.",
			body: "Je team, je winkels en elke bestelling op één plek. De naam en de URL kun je altijd wijzigen.",
		},
		plan: {
			lead: "Veertien dagen",
			accent: "gratis.",
			body: "Geen kaart nodig om te starten. Kies wat nu past en schakel op of af via facturatie wanneer je wilt.",
		},
		store: {
			lead: "Shopify blijft",
			accent: "de bron",
			tail: "van waarheid.",
			body: "Insyte leest bestellingen, producten en klanten uit je winkel. Je trekt de toegang altijd in via Shopify-beheer.",
		},
		sync: {
			lead: "Elke bestelling,",
			accent: "één",
			tail: "wachtrij.",
			body: "De eerste import staat er binnen seconden. Daarna houdt Insyte alles gesynchroniseerd, zodat de wachtrij altijd van vandaag is.",
		},
		analysis: {
			lead: "Eerst kijken,",
			accent: "dan één ding.",
			body: "Insyte leest je winkel zoals een nieuwe compagnon op zijn eerste dag: het zoekt het grootste knelpunt en zet de aanpak alvast klaar. Bij te weinig data zegt het dat eerlijk.",
		},
		offline: {
			lead: "Ook als",
			accent: "jij",
			tail: "slaapt.",
			body: "Insyte werkt door binnen de grenzen die jij zet. Wat het niet zelf mag, staat 's ochtends voor je klaar.",
		},
		ready: {
			...BOOKEND,
			body: "Elke ochtend zet Insyte de drie of vier dingen die jou nodig hebben bovenaan, en houdt de rest uit beeld.",
		},
	},
	supplier: {
		profile: {
			lead: "Jij regelt de voorraad.",
			accent: "Insyte",
			tail: "regelt de rest.",
			body: "Klanten zien je bedrijf op pakbonnen en in correspondentie over terugbetalingen, dus kies een naam die ze herkennen.",
		},
		api: {
			lead: "Bestellingen komen binnen",
			accent: "zonder",
			tail: "spreadsheet.",
			body: "Koppel het platform dat je al gebruikt, of sla het over. Maatwerkkoppelingen richten we één op één met je in.",
		},
		stock: {
			lead: "Echte voorraad",
			accent: "verkoopt.",
			body: "Kies hoe je doorgeeft wat er op de plank ligt. Je kunt altijd van modus wisselen.",
		},
		ready: {
			...BOOKEND,
			body: "Je leveranciersdashboard is live. Bestellingen die aan jou zijn toegewezen komen daar binnen, en we mailen je zodra de eerste er is.",
		},
	},
	affiliate: {
		profile: {
			lead: "Stuur je publiek door.",
			accent: "Verdien",
			tail: "als ze kopen.",
			body: "Vertel ons wie je bereikt en waar. Hoe specifieker je bent, hoe sneller we je kunnen goedkeuren.",
		},
		review: {
			lead: "Gelezen door",
			accent: "een mens,",
			tail: "geen filter.",
			body: "We beoordelen elke affiliate met de hand. Je hoort binnen twee werkdagen een besluit.",
		},
	},
};

export function brandLine(persona: OnboardingPersona | null, stepId: string): BrandLine {
	return (persona ? TAILS[persona][stepId] : undefined) ?? HEAD[stepId] ?? BOOKEND;
}

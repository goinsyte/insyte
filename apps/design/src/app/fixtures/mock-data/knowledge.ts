import type { KnowledgeSeed } from "@insyte/ui/data-source";
import { byScenario, longName } from "../scenario";

/*
 * The knowledge base (PLAN 28, ADR-0027): what the customer agent and Vraag Insyte answer from, in
 * Northwind's own words. A normal Tuesday: nine chapters, two still drafts, and five questions the
 * agent could not answer from them. The busy week has eighteen, one close to the 40.000-teken limit.
 * The version numbers match what the agent log cites ("Kennisbank: Verzending en levertijden · 4").
 */

const D = 86_400_000;
const at = (days: number) => new Date(Date.now() - days * D).toISOString();

type Spec = { id: string; title: string; audience: "customer_agent" | "assistant" | "both"; uses: number; versions: Array<[days: number, by: string, body: string, published: boolean]> };

const SHIPPING = `## Levertijden

We versturen op werkdagen vóór 15:00 besteld dezelfde dag.

- Nederland: 1–2 werkdagen
- België en Luxemburg: 2–3 werkdagen
- Duitsland en Oostenrijk: 2–4 werkdagen
- Frankrijk, Polen en de rest van de EU: 4–6 werkdagen

## Verzendkosten

Gratis vanaf €75. Daaronder €4,95 in Nederland en België, €6,95 in de rest van de EU.

## Track & trace

Je krijgt de track & trace per mail zodra het pakket bij de vervoerder is. In Nederland is dat PostNL, in Duitsland DHL.`;

const RETURNS_OLD = `## Termijn

Je kunt binnen 30 dagen na bezorging retourneren.

## Hoe

1. Ga naar het retourportaal via de link in je verzendmail
2. Vul je bestelnummer en e-mailadres in
3. Kies wat je terugstuurt, waarom, en of je ruilt of je geld terug wilt

Retourneren is gratis binnen Nederland en België.`;

const RETURNS = `${RETURNS_OLD}

## Wat niet terug kan

- Mutsen, om hygiënische redenen
- Artikelen met het label sale: ruilen kan wel, geld terug niet

## Geld terug

Binnen 5 werkdagen nadat we je pakket hebben ontvangen, op dezelfde betaalmethode.`;

const SPECS: Spec[] = [
	{ id: "kb_shipping", title: "Verzending en levertijden", audience: "both", uses: 41, versions: [[90, "Elena Hart", SHIPPING.split("## Track")[0]!, true], [60, "Sofía Kim", SHIPPING.replace("Polen en ", ""), true], [30, "Sofía Kim", SHIPPING.replace("Polen en ", "").replace("15:00", "14:00"), true], [6, "Sofía Kim", SHIPPING, true]] },
	{ id: "kb_returns", title: "Retourneren", audience: "both", uses: 23, versions: [[120, "Elena Hart", RETURNS_OLD.replace("30", "14"), true], [100, "Elena Hart", RETURNS_OLD, true], [70, "Sofía Kim", RETURNS_OLD, true], [40, "Sofía Kim", `${RETURNS_OLD}\n\n## Geld terug\n\nBinnen 5 werkdagen.`, true], [4, "Sofía Kim", `${RETURNS_OLD}\n\n## Geld terug\n\nBinnen 5 werkdagen nadat we je pakket hebben ontvangen.`, true], [2, "Elena Hart", RETURNS, true]] },
	{ id: "kb_sizes", title: "Maten", audience: "customer_agent", uses: 12, versions: [[80, "Maya Roy", "## Hoe valt het?\n\nOnze jassen vallen normaal.", true], [50, "Maya Roy", "## Hoe valt het?\n\nOnze jassen vallen normaal. Twijfel je, neem de grotere maat.", true], [9, "Maya Roy", "## Hoe valt het?\n\nOnze jassen vallen normaal. Twijfel je tussen twee maten, neem dan de grotere: dan past er een trui onder.\n\n## Broeken\n\nDe Field broek valt een halve maat klein in de taille.\n\n## Cascade pufferjas\n\nValt ruim. Neem je gewone maat, of een kleiner als je hem strak wilt.", true]] },
	{ id: "kb_payment", title: "Betalen", audience: "customer_agent", uses: 7, versions: [[100, "Elena Hart", "## Betaalmethoden\n\niDEAL, creditcard en PayPal.", true], [20, "Elena Hart", "## Betaalmethoden\n\niDEAL, creditcard, Klarna (achteraf betalen binnen 30 dagen) en PayPal.\n\n## Kortingscodes\n\nEén code per bestelling. Vul hem in bij het afrekenen.", true]] },
	{ id: "kb_products", title: "Over de producten", audience: "both", uses: 9, versions: [[60, "Maya Roy", "## Wassen\n\nWas op 30 graden, binnenstebuiten.", true], [14, "Maya Roy", "## Wassen\n\nWas op 30 graden, binnenstebuiten. De Aurora fleece niet in de droger.\n\n## Materialen\n\nDe Coastline bomberjack is van gerecycled nylon. De Mariner muts is merinowol.", true]] },
	{ id: "kb_brand", title: "Over het merk", audience: "assistant", uses: 2, versions: [[150, "Elena Hart", "## Wie we zijn\n\nNorthwind maakt jassen en basics die lang meegaan, ontworpen in Amsterdam en gemaakt bij vier vaste leveranciers.", true]] },
	{ id: "kb_giftcards", title: "Cadeaubonnen en kortingscodes", audience: "customer_agent", uses: 4, versions: [[45, "Sofía Kim", "## Cadeaubonnen\n\nEen cadeaubon is een jaar geldig en kun je in delen besteden.", true], [16, "Sofía Kim", "## Cadeaubonnen\n\nEen cadeaubon is een jaar geldig en kun je in delen besteden.\n\n## Kortingscodes\n\nEén code per bestelling.", true]] },
	{ id: "kb_complaints", title: "Klachten en garantie", audience: "both", uses: 0, versions: [[3, "Sofía Kim", "## Garantie\n\nOp naden en ritsen geven we een jaar garantie.\n\n## Een probleem melden\n\nMeld het via het retourportaal, met een foto.", false]] },
	{ id: "kb_wholesale", title: "Groothandel", audience: "assistant", uses: 0, versions: [[1, "Elena Hart", "## Minimale afname\n\n50 stuks per model, gemengde maten.", false]] },
];

const build = (specs: Spec[]): KnowledgeSeed["articles"] =>
	specs.map((s) => {
		const versions = s.versions.map(([days, by, body, published], i) => ({ n: i + 1, at: at(days), by, body, title: s.title, published }));
		const last = versions.at(-1)!;
		return { id: s.id, title: s.title, audience: s.audience, body: last.body, versions, editedAt: last.at, editedBy: last.by, uses7d: s.uses };
	});

const GAPS: KnowledgeSeed["gaps"] = [
	{ id: "gap_1", question: "Kan ik een sale-artikel retourneren?", at: at(0.3), customer: "Liam O'Connor", threadId: "wc_2", channel: "webchat", state: "open" },
	{ id: "gap_2", question: "Versturen jullie ook naar Zwitserland?", at: at(1), customer: "Soren Nilsson", channel: "webchat", state: "open" },
	{ id: "gap_3", question: "Kan ik een cadeaubon combineren met een kortingscode?", at: at(2), customer: "Maria Garcia", channel: "webchat", state: "open" },
	{ id: "gap_4", question: "Kan ik mijn bestelling nog wijzigen nadat ik heb betaald?", at: at(3), customer: "Hannah Schmidt", channel: "whatsapp", state: "open" },
	{ id: "gap_5", question: "Kan ik laten bezorgen bij een DHL-punt?", at: at(5), customer: "Felix Müller", channel: "email", state: "open" },
];

const busy = (): KnowledgeSeed => {
	const extra: Spec[] = Array.from({ length: 9 }, (_, i) => ({
		id: `kb_extra_${i}`,
		title: ["Zakelijke bestellingen en facturen voor bedrijven in de Benelux", "Verzending buiten de EU", "Onderhoud van wol en merino", "Pre-orders en wachtlijsten", "Duurzaamheid en leveranciers", "Klantenservice tijdens de feestdagen", "Persvragen", "Samenwerkingen met makers", "Privacy en je gegevens"][i]!,
		audience: (["both", "customer_agent", "assistant"] as const)[i % 3]!,
		uses: (i * 7) % 30,
		versions: [[10 + i, longName(i + 20), i === 0 ? "## Facturen\n\n".concat("Elke zakelijke bestelling krijgt een factuur met btw-nummer. ".repeat(620)) : `## ${["Facturen", "Buiten de EU", "Wol", "Pre-orders", "Duurzaamheid", "Feestdagen", "Pers", "Makers", "Privacy"][i]}\n\nUitleg voor klanten en het team.`, i % 4 !== 3]],
	}));
	return { articles: build([...SPECS, ...extra]), gaps: [...GAPS, ...Array.from({ length: 12 }, (_, i) => ({ id: `gap_b${i}`, question: `Klopt het dat ${["de Field broek", "de Cascade pufferjas", "de Harbor regenjas"][i % 3]} ${["anders valt dan vorig jaar", "ook in olijfgroen komt", "waterdicht is bij harde regen"][i % 3]}?`, at: at(i * 0.4), customer: longName(i), channel: "webchat" as const, state: "open" as const }))] };
};

export const knowledgeSeed: KnowledgeSeed = byScenario<KnowledgeSeed>({ empty: { articles: [], gaps: [] }, settled: { articles: build(SPECS), gaps: GAPS }, busy });

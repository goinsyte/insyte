import type { Block, Chapter, Course, CourseQuestion, CoursesSeed, Progress } from "@insyte/ui/data-source";
import { byScenario, longName } from "../scenario";

/*
 * Courses (PLAN 39): how Northwind teaches its team. A normal Tuesday has three chapters, seven
 * courses (one draft, one archived), progress for the five people besides the owner and two
 * questions, one still open. The first day has nothing; the busy week adds a long chapter of
 * long-titled courses and the long-named team.
 */

const D = 86_400_000;
const at = (days: number, h = 10) => new Date(Date.now() - days * D + (h - 10) * 3_600_000).toISOString();
const day = (days: number) => new Date(Date.now() + days * D).toISOString().slice(0, 10);
/* A drawing of the order's Verzending section, so the image block shows what the text is about. */
const TRACKING = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" font-family="Inter, system-ui, sans-serif">
<rect width="1200" height="675" fill="#f4f4f4"/>
<rect x="160" y="70" width="880" height="535" rx="16" fill="#fff"/>
<text x="210" y="135" font-size="30" font-weight="500" fill="#2b2b2b">Bestelling SO-12218</text>
<text x="210" y="172" font-size="20" fill="#6b6b6b">Bezorgen · PostNL · 3SNWD0012844921</text>
<rect x="210" y="205" width="780" height="1" fill="#e6e6e6"/>
<text x="210" y="250" font-size="22" font-weight="500" fill="#2b2b2b">Verzending</text>
<rect x="196" y="272" width="808" height="72" rx="10" fill="#eef0ff"/>
<rect x="222" y="300" width="14" height="14" fill="#2f3fd8"/>
<text x="258" y="304" font-size="21" font-weight="500" fill="#2b2b2b">Bij sorteercentrum Nieuwegein</text>
<text x="258" y="330" font-size="18" fill="#6b6b6b">Vandaag 06:14 · laatste scan</text>
<rect x="224" y="374" width="10" height="10" fill="#b5b5b5"/>
<text x="258" y="380" font-size="20" fill="#4a4a4a">Onderweg naar Nederland</text>
<text x="258" y="405" font-size="17" fill="#8a8a8a">Gisteren 22:40</text>
<rect x="224" y="444" width="10" height="10" fill="#b5b5b5"/>
<text x="258" y="450" font-size="20" fill="#4a4a4a">Opgehaald bij de leverancier</text>
<text x="258" y="475" font-size="17" fill="#8a8a8a">Maandag 15:02</text>
<rect x="224" y="514" width="10" height="10" fill="#b5b5b5"/>
<text x="258" y="520" font-size="20" fill="#4a4a4a">Label aangemaakt</text>
<text x="258" y="545" font-size="17" fill="#8a8a8a">Maandag 11:30</text>
</svg>`)}`;

const text = (id: string, title: string, body: string): Block => ({ id, kind: "text", title, body });
const quiz = (id: string, question: string, options: string[], right: number, explain: string): Block => ({
	id,
	kind: "quiz",
	question,
	options: options.map((t, i) => ({ id: `${id}_${i}`, text: t })),
	correct: `${id}_${right}`,
	explain,
});

const CHAPTERS: Chapter[] = [
	{ id: "ch_service", title: "Klantenservice", modules: [{ id: "md_basis", title: "De basis" }, { id: "md_lastig", title: "Lastige gesprekken" }] },
	{ id: "ch_ops", title: "Bestellingen en leveranciers", modules: [{ id: "md_doorsturen", title: "Doorsturen" }, { id: "md_retour", title: "Retouren en chargebacks" }] },
	{ id: "ch_insyte", title: "Werken in Insyte", modules: [{ id: "md_start", title: "Je eerste week" }] },
];

const base = { order: "free", suppliers: { kind: "none" }, deadline: "", passMark: 80, questions: true, createdBy: "mem_elena" } as const;

const COURSES: Course[] = [
	{
		...base,
		id: "crs_antwoorden",
		title: "Zo antwoorden we klanten",
		chapterId: "ch_service",
		moduleId: "md_basis",
		description: "De toon van Northwind, hoe snel we reageren en wat er in elk antwoord moet staan.",
		status: "live",
		audience: { kind: "all" },
		badge: "chat",
		updatedAt: at(12),
		publishedAt: at(40),
		blocks: [
			text("b_ant_1", "Onze toon", "We schrijven zoals we praten: kort, vriendelijk en met je voornaam eronder. Geen 'Geachte klant', geen excuses in drie zinnen.\n\nBegin met het antwoord op de vraag. De uitleg komt daarna, als die nodig is."),
			{ id: "b_ant_2", kind: "video", title: "Een goed antwoord, stap voor stap", url: "https://www.loom.com/share/northwind-goed-antwoord", minutes: 4 },
			text("b_ant_3", "Hoe snel", "Een e-mail beantwoorden we binnen 4 werkuren. Op de websitechat reageert de klantagent meteen; neem je het over, dan binnen 2 minuten.\n\nLukt het niet binnen die tijd, stuur dan een kort bericht dat je ermee bezig bent."),
			quiz("b_ant_4", "Binnen hoeveel werkuren beantwoorden we een e-mail?", ["Binnen 1 werkuur", "Binnen 4 werkuren", "Binnen 24 uur"], 1, "Binnen 4 werkuren. Lukt dat niet, dan sturen we een kort bericht dat we ermee bezig zijn."),
			text("b_ant_5", "Wat er altijd in staat", "- Het bestelnummer, zodat de klant weet waar het over gaat\n- Wat er nu gebeurt, en wanneer\n- Je voornaam"),
			quiz("b_ant_6", "Hoe begin je een antwoord?", ["Met een excuus", "Met het antwoord op de vraag", "Met 'Geachte klant'"], 1, "Met het antwoord. De uitleg komt daarna, als die nodig is."),
		],
	},
	{
		...base,
		id: "crs_boos",
		title: "Een boze klant kalmeren",
		chapterId: "ch_service",
		moduleId: "md_lastig",
		description: "Wat je zegt als een pakket te laat is en de klant al twee keer heeft gemaild.",
		status: "live",
		audience: { kind: "some", roles: ["Klantenservice", "CX-lead"], members: [] },
		badge: "shield",
		deadline: day(9),
		updatedAt: at(8),
		publishedAt: at(20),
		blocks: [
			text("b_boos_1", "Eerst erkennen", "Zeg wat er misging, in je eigen woorden: 'Je pakket had er dinsdag moeten zijn en het is er nog niet.' Dat is geen schuld bekennen, dat is laten zien dat je het gelezen hebt."),
			text("b_boos_2", "Dan iets doen", "Kijk in de bestelling waar het pakket is. Is het langer dan 5 werkdagen onderweg, bied dan een nieuw pakket of je geld terug aan. Een terugbetaling vraagt Insyte altijd eerst aan jou."),
			{ id: "b_boos_3", kind: "image", title: "Waar je de track & trace vindt", src: TRACKING, caption: "In de bestelling, onder Verzending. De laatste scan staat bovenaan." },
			quiz("b_boos_4", "Na hoeveel werkdagen onderweg bied je een nieuw pakket aan?", ["Na 2 werkdagen", "Na 5 werkdagen", "Na 10 werkdagen"], 1, "Na 5 werkdagen onderweg bied je een nieuw pakket of je geld terug aan."),
		],
	},
	{
		...base,
		id: "crs_doorsturen",
		title: "Een bestelling doorsturen naar de leverancier",
		chapterId: "ch_ops",
		moduleId: "md_doorsturen",
		description: "Van betaalde bestelling tot bevestiging van de leverancier, en wat je doet als een artikel op is.",
		status: "live",
		order: "fixed",
		audience: { kind: "some", roles: ["Operations"], members: ["mem_sofia"] },
		suppliers: { kind: "some", ids: ["sup_allure"] },
		badge: "parcel",
		updatedAt: at(5),
		publishedAt: at(30),
		blocks: [
			text("b_door_1", "De wachtrij", "Onder Bestellingen → Te versturen staat alles wat betaald is en nog niet bij een leverancier ligt. Insyte kiest de leverancier per regel; jij controleert en verstuurt."),
			text("b_door_2", "Wachten op bevestiging", "Een leverancier bevestigt binnen 24 uur. Daarna zet Insyte de bestelling bij Wacht op bevestiging en stuurt het één herinnering."),
			quiz("b_door_3", "Binnen hoeveel uur bevestigt een leverancier?", ["Binnen 4 uur", "Binnen 24 uur", "Binnen 72 uur"], 1, "Binnen 24 uur. Daarna stuurt Insyte één herinnering."),
			text("b_door_4", "Uitverkocht", "Meldt de leverancier dat een artikel op is, dan kies je een andere leverancier of je mailt de klant met een alternatief. Annuleren doe je pas als de klant dat wil."),
		],
	},
	{
		...base,
		id: "crs_chargeback",
		title: "Chargebacks: bewijs verzamelen",
		chapterId: "ch_ops",
		moduleId: "md_retour",
		description: "Welk bewijs Klarna en Shopify Payments willen zien, en hoe Insyte het pakket voor je klaarzet.",
		status: "live",
		audience: { kind: "some", roles: ["CX-lead", "Eigenaar"], members: ["mem_liam"] },
		badge: "key",
		updatedAt: at(3),
		publishedAt: at(14),
		blocks: [
			text("b_cb_1", "Wat telt als bewijs", "- De track & trace met de bezorgscan\n- De mails met de klant over deze bestelling\n- De productpagina zoals die was op de dag van de bestelling\n\nInsyte zet dit klaar als bewijspakket. Indienen doe jij: dat kan niet terug."),
			quiz("b_cb_2", "Wie dient het bewijs in bij Klarna?", ["Insyte, zelf", "Jij, na controle", "De klant"], 1, "Jij. Indienen kan niet terug, dus Insyte vraagt het altijd eerst."),
			text("b_cb_3", "De termijn", "Je hebt meestal 7 dagen om bewijs in te dienen. De deadline staat bij elke chargeback; Insyte waarschuwt 2 dagen ervoor."),
		],
	},
	{
		...base,
		id: "crs_eerste_week",
		title: "Je eerste week in Insyte",
		chapterId: "ch_insyte",
		moduleId: "md_start",
		description: "Waar je begint als je inlogt, wat Insyte zelf doet en waar je dat terugziet.",
		status: "live",
		order: "fixed",
		audience: { kind: "all" },
		badge: "flag",
		deadline: day(-2),
		passMark: 70,
		updatedAt: at(25),
		publishedAt: at(60),
		blocks: [
			text("b_ew_1", "Dashboard", "Als je inlogt staat bovenaan wat op jou wacht. Daaronder wat Insyte heeft voorbereid en wil voorleggen."),
			{ id: "b_ew_2", kind: "video", title: "Een rondje door Insyte", url: "https://www.loom.com/share/northwind-rondje-insyte", minutes: 6 },
			text("b_ew_3", "Wat Insyte zelf doet", "Insyte zet statussen, wijst tickets toe en schrijft notities zonder te vragen. Alles wat geld kost of namens de winkel spreekt, legt het eerst aan jou voor. Onder Vraag Insyte → Wat Insyte deed zie je alles terug, en veel kun je 5 minuten lang terugdraaien."),
			quiz("b_ew_4", "Hoe lang kun je een actie van Insyte terugdraaien?", ["1 minuut", "5 minuten", "Een dag"], 1, "5 minuten, voor alles wat terug kan."),
		],
	},
	{
		...base,
		id: "crs_retour",
		title: "Retouren beoordelen",
		chapterId: "ch_ops",
		moduleId: "md_retour",
		description: "",
		status: "draft",
		audience: { kind: "some", roles: ["Klantenservice"], members: [] },
		badge: "parcel",
		updatedAt: at(1, 15),
		blocks: [
			text("b_ret_1", "De termijn", "Een retour kan binnen 30 dagen na bezorging, een claim binnen 60 dagen. Sale-artikelen nemen we niet terug."),
			quiz("b_ret_2", "", ["", "", ""], 0, ""),
		],
	},
	{
		...base,
		id: "crs_toon_oud",
		title: "Toon en stijl (2025)",
		chapterId: "ch_service",
		moduleId: "md_basis",
		description: "De oude schrijfwijzer, voor we 'je' gingen zeggen.",
		status: "archived",
		audience: { kind: "all" },
		badge: "star",
		updatedAt: at(70),
		publishedAt: at(200),
		blocks: [text("b_oud_1", "U of je", "We spraken klanten aan met u. Sinds januari zeggen we je.")],
	},
];

const progress = (memberId: string, courseId: string, done: number, opts: { finished?: number; score?: number; attempts?: number; started?: number } = {}): Progress => {
	const c = COURSES.find((x) => x.id === courseId)!;
	return {
		courseId,
		memberId,
		done: c.blocks.slice(0, done).map((b) => b.id),
		answers: {},
		attempts: opts.attempts ?? (opts.finished !== undefined ? 1 : 0),
		score: opts.score,
		startedAt: at(opts.started ?? 10),
		finishedAt: opts.finished !== undefined ? at(opts.finished, 14) : undefined,
	};
};

const PROGRESS: Progress[] = [
	progress("mem_elena", "crs_antwoorden", 6, { finished: 39, score: 100 }),
	progress("mem_elena", "crs_eerste_week", 4, { finished: 58, score: 100 }),
	progress("mem_sofia", "crs_antwoorden", 6, { finished: 30, score: 100 }),
	progress("mem_sofia", "crs_boos", 4, { finished: 6, score: 100 }),
	progress("mem_sofia", "crs_eerste_week", 4, { finished: 50, score: 100 }),
	progress("mem_sofia", "crs_doorsturen", 2, { started: 2 }),
	progress("mem_sofia", "crs_chargeback", 3, { finished: 9, score: 100 }),
	progress("mem_ethan", "crs_antwoorden", 6, { finished: 12, score: 50, attempts: 2 }),
	progress("mem_ethan", "crs_doorsturen", 4, { finished: 4, score: 100 }),
	progress("mem_ethan", "crs_eerste_week", 2, { started: 15 }),
	progress("mem_liam", "crs_antwoorden", 3, { started: 4 }),
	progress("mem_liam", "crs_doorsturen", 4, { finished: 3, score: 100 }),
	progress("mem_liam", "crs_eerste_week", 4, { finished: 20, score: 100 }),
	progress("mem_maya", "crs_antwoorden", 6, { finished: 18, score: 100 }),
	progress("mem_amber", "crs_antwoorden", 6, { finished: 7, score: 100 }),
	progress("mem_amber", "crs_boos", 1, { started: 1 }),
];

const QUESTIONS: CourseQuestion[] = [
	{ id: "q_1", courseId: "crs_boos", memberId: "mem_amber", blockId: "b_boos_2", text: "Geldt die 5 werkdagen ook voor pakketten naar Duitsland? Die doen er vaak langer over.", at: at(1, 11) },
	{ id: "q_2", courseId: "crs_antwoorden", memberId: "mem_ethan", blockId: "b_ant_3", text: "Tellen werkuren ook op zaterdag?", at: at(11), answer: "Nee, alleen maandag tot en met vrijdag, 9:00 tot 17:30.", answeredBy: "Elena Hart" },
];

function busy(): CoursesSeed {
	const long: Chapter = { id: "ch_long", title: "Productkennis per categorie, seizoen en leverancier", modules: [{ id: "md_long_1", title: "Jassen en buitenkleding voor het najaar" }, { id: "md_long_2", title: "Accessoires, sjaals, mutsen en handschoenen" }] };
	const extra: Course[] = Array.from({ length: 9 }, (_, i) => ({
		...base,
		id: `crs_busy_${i}`,
		title: ["Maten en pasvorm van de Aurora Hooded Fleece en de rest van de fleececollectie", "Wasvoorschriften die klanten het vaakst vragen", "Welke leverancier levert welke kleur", "Seizoensaanbiedingen en wanneer ze stoppen", "Klachten over stiksels: foto's beoordelen", "Duitse klanten: veelgestelde vragen over verzending en douane", "Cadeaubonnen en tegoeden", "Sale-artikelen en de uitzonderingen op het retourbeleid", "Productfoto's die klanten verwarren"][i]!,
		chapterId: "ch_long",
		moduleId: i < 5 ? "md_long_1" : "md_long_2",
		description: "Wat de klant vraagt, en het antwoord dat we geven.",
		status: i === 3 ? "draft" : "live",
		audience: { kind: "all" },
		badge: "star",
		updatedAt: at(i + 1),
		publishedAt: i === 3 ? undefined : at(i + 20),
		blocks: [text(`b_busy_${i}_1`, "Het antwoord", "Kijk eerst in de productpagina. Staat het er niet, vraag het dan in #operations; het antwoord komt binnen 1 werkdag in deze cursus.")],
	}));
	const people = Array.from({ length: 14 }, (_, i) => `mem_busy_${i}`);
	const extraProgress = people.flatMap((m, i) => [
		{ courseId: "crs_antwoorden", memberId: m, done: i % 3 === 0 ? [] : ["b_ant_1", "b_ant_2"], answers: {}, attempts: i % 4 === 0 ? 1 : 0, score: i % 4 === 0 ? 83 : undefined, startedAt: at(i + 1), finishedAt: i % 4 === 0 ? at(i) : undefined },
	]);
	const extraQuestions = people.slice(0, 5).map((m, i) => ({ id: `q_busy_${i}`, courseId: "crs_antwoorden", memberId: m, text: `${longName(i + 20).split(" ")[0]} vraagt: mag ik in een antwoord naar een andere bestelling van dezelfde klant verwijzen, ook als die van een andere winkel is?`, at: at(0, 9 + i) }));
	return { chapters: [...CHAPTERS, long], courses: [...COURSES, ...extra], progress: [...PROGRESS, ...extraProgress], questions: [...QUESTIONS, ...extraQuestions] };
}

export const coursesSeed: CoursesSeed = byScenario({
	empty: { chapters: [], courses: [], progress: [], questions: [] },
	settled: { chapters: CHAPTERS, courses: COURSES, progress: PROGRESS, questions: QUESTIONS },
	busy,
});

import { byScenario } from "../scenario";
import type { Conversation } from "@insyte/ui/app/lib/types/domain";
import type { ChatCard, ChatProfile, ChatReaction, RichMessage } from "@insyte/ui/data-source";
export type { ChatReaction, ChatCard, RichMessage };




const TODAY = "2026-05-23";
function todayAt(time: string) {
	return `${TODAY}T${time}:00Z`;
}

const SEED_CONVERSATIONS: Conversation[] = [
	{
		id: "conv_customer_service",
		type: "group",
		name: "customer-service",
		participants: [
			{ id: "u_timo", name: "Timo" },
			{ id: "u_henk", name: "Henk" },
			{ id: "u_frost", name: "Frost" },
		],
		last_message_at: todayAt("11:45"),
		last_message_preview:
			"Nieuwe chargeback-melding van Stripe · winkans 74% via Insyte AI.",
		unread_count: 4,
		messages: [],
	},
	{
		id: "conv_fulfillment",
		type: "group",
		name: "fulfillment",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_marco", name: "Marco Rossi" },
			{ id: "u_jacob", name: "Jacob" },
		],
		last_message_at: todayAt("10:21"),
		last_message_preview:
			"Alle drie de SO-129xx-pakketten zijn bij DHL · track & trace verstuurd.",
		unread_count: 0,
		messages: [],
	},
	{
		id: "conv_team_ops",
		type: "group",
		name: "operations",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_sofia", name: "Sofía K." },
			{ id: "u_liam", name: "Liam T." },
			{ id: "u_maya", name: "Maya R." },
		],
		last_message_at: todayAt("09:02"),
		last_message_preview:
			"Let op: de Klarna-deadline voor DSP-2214 is morgen einde dag.",
		unread_count: 2,
		messages: [],
	},
	{
		id: "conv_supplier_allure",
		type: "group",
		name: "allure-fulfillment",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_marco", name: "Marco Rossi" },
			{ id: "u_sofia", name: "Sofía K." },
		],
		last_message_at: "2026-05-22T09:42:00Z",
		last_message_preview: "Track & trace verstuurd voor de SO-129xx-pakketten.",
		unread_count: 0,
		messages: [],
	},
	{
		id: "conv_supplier_dpc",
		type: "group",
		name: "dpc-apparel",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_jacob", name: "Jacob" },
		],
		last_message_at: "2026-05-21T16:00:00Z",
		last_message_preview: "Mariner wollen muts wordt aangevuld · 800 stuks onderweg.",
		unread_count: 1,
		messages: [],
	},
	{
		id: "conv_dm_maya",
		type: "dm",
		name: "Maya R.",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_maya", name: "Maya R." },
		],
		last_message_at: "2026-05-20T13:10:00Z",
		last_message_preview: "Helder · ik doe de Franse vertalingen vandaag.",
		unread_count: 0,
		messages: [],
	},
	{
		id: "conv_dm_marco",
		type: "dm",
		name: "Marco Rossi",
		participants: [
			{ id: "u_elena", name: "Elena Hart" },
			{ id: "u_marco", name: "Marco Rossi" },
		],
		last_message_at: "2026-05-20T11:42:00Z",
		last_message_preview: "Kijk er even naar als je tijd hebt.",
		unread_count: 0,
		messages: [],
	},
];

/** A new workspace starts with one channel and nobody has written in it yet. */
const FIRST_DAY: Conversation[] = [
	{ id: "conv_algemeen", type: "group", name: "algemeen", participants: [{ id: "u_elena", name: "Elena Hart" }], last_message_at: todayAt("09:00"), last_message_preview: "", unread_count: 0, messages: [] },
];

export const conversations: Conversation[] = byScenario({ empty: FIRST_DAY, settled: SEED_CONVERSATIONS });

export const conversationDescription: Record<string, string> = {
	conv_customer_service: "3 teamleden · Vragen en escalaties van klanten",
	conv_fulfillment: "3 teamleden · Uitgaande zendingen en uitzonderingen",
	conv_team_ops: "4 teamleden · Dagelijkse stand-up van operations",
	conv_supplier_allure: "3 teamleden · Afhandeling met Allure",
	conv_supplier_dpc: "2 teamleden · DPC apparel",
	conv_dm_maya: "Privébericht",
	conv_dm_marco: "Privébericht",
};

export const messagesByConversation: Record<string, RichMessage[]> = {
	conv_customer_service: [
		{
			id: "m1",
			conversation_id: "conv_customer_service",
			sender_id: "u_timo",
			sender_name: "Timo",
			body: "Goedemorgen. Er is een reactie van de klant op chargeback **#4821**. Ze staan open voor een minnelijke schikking.",
			at: todayAt("09:14"),
			reactions: [{ emoji: "👍", count: 2, mine: true }],
		},
		{
			id: "m2",
			conversation_id: "conv_customer_service",
			sender_id: "u_henk",
			sender_name: "Henk",
			body: "Ik pak het op. Ik gebruik sjabloon `CB-SETTLEMENT-NL` als basis.",
			at: todayAt("09:17"),
		},
		{
			id: "m3",
			conversation_id: "conv_customer_service",
			sender_id: "u_frost",
			sender_name: "Frost",
			body: "Update: de klant van SO-12224 vraagt waar het pakket blijft. De track & trace staat al 5 dagen stil in Amsterdam.",
			at: todayAt("10:02"),
			records: [{ kind: "order", id: "ord_5024" }],
		},
		{
			id: "m4",
			conversation_id: "conv_customer_service",
			sender_id: "u_henk",
			sender_name: "Henk",
			body: "Het pakket is vrijgegeven door de douane en wordt morgen bezorgd. Ik stuur de klant een update.",
			at: todayAt("10:33"),
			reactions: [
				{ emoji: "✅", count: 3, mine: true },
				{ emoji: "🙏", count: 1 },
			],
		},
		{
			id: "m5",
			conversation_id: "conv_customer_service",
			sender_id: "u_timo",
			sender_name: "Timo",
			body: "Nieuwe chargeback-melding van Klarna voor DSP-2210 · winkans 74% volgens Insyte. Het bewijspakket wordt automatisch samengesteld.",
			at: todayAt("11:45"),
			records: [{ kind: "chargeback", id: "cb_2210" }],
		},
		{
			id: "m6",
			conversation_id: "conv_customer_service",
			sender_id: "u_insyte",
			sender_name: "Insyte",
			body: "Het bewijspakket voor DSP-2210 is compleet: bezorgbevestiging, de mails met de klant en de factuur. Zal ik het indienen bij Klarna?",
			at: todayAt("11:52"),
			action: { id: "act_seed_evidence", command: "evidence", target: { kind: "chargeback", id: "cb_2210" }, by: "insyte", state: "proposed", level: "ask" },
		},
	],
	conv_fulfillment: [
		{
			id: "fm1",
			conversation_id: "conv_fulfillment",
			sender_id: "u_sofia",
			sender_name: "Sofía K.",
			body: "Kun je bevestigen dat SO-12940, 12941 en 12943 de deur uit zijn?",
			at: todayAt("09:30"),
		},
		{
			id: "fm2",
			conversation_id: "conv_fulfillment",
			sender_id: "u_marco",
			sender_name: "Marco Rossi",
			body: "Alle drie de SO-129xx-pakketten zijn bij DHL · track & trace verstuurd.",
			at: todayAt("10:21"),
			reactions: [{ emoji: "🚚", count: 2 }],
		},
	],
	conv_team_ops: [
		{
			id: "om1",
			conversation_id: "conv_team_ops",
			sender_id: "u_elena",
			sender_name: "Elena Hart",
			body: "Let op: de Klarna-deadline voor DSP-2214 is morgen einde dag.",
			at: todayAt("09:02"),
			card: {
				type: "ai",
				headline: "Insyte AI · Bewijs klaar",
				body: "E-mails van de klant, bezorgbevestiging, verificatie van IP en adres.",
				cta: "Pakket bekijken",
			},
		},
	],
	conv_supplier_allure: [
		{ id: "sa1", conversation_id: "conv_supplier_allure", sender_id: "u_elena", sender_name: "Elena Hart", body: "Hoi Marco · kun je bevestigen dat SO-12940, 12941 en 12943 vandaag de deur uit gaan?", at: "2026-05-22T09:30:00Z" },
		{ id: "sa2", conversation_id: "conv_supplier_allure", sender_id: "u_marco", sender_name: "Marco Rossi", body: "Alle drie de SO-129xx-pakketten zijn bij DHL · track & trace verstuurd.", at: "2026-05-22T09:42:00Z" },
		{ id: "sa3", conversation_id: "conv_supplier_allure", sender_id: "u_sofia", sender_name: "Sofía K.", body: "Top. De klant van SO-12224 vraagt waar haar pakket blijft, kun je de nieuwe overdrachtsdatum bevestigen?", at: "2026-05-23T08:41:00Z" },
	],
	conv_supplier_dpc: [],
	conv_dm_maya: [
		{
			id: "dm1",
			conversation_id: "conv_dm_maya",
			sender_id: "u_maya",
			sender_name: "Maya R.",
			body: "Helder. Ik doe de Franse vertalingen vandaag.",
			at: "2026-05-20T13:10:00Z",
		},
	],
	conv_dm_marco: [
		{
			id: "dm2",
			conversation_id: "conv_dm_marco",
			sender_id: "u_marco",
			sender_name: "Marco Rossi",
			body: "Kijk er even naar als je tijd hebt.",
			at: "2026-05-20T11:42:00Z",
		},
	],
};

export const brandConversation: Conversation = {
	id: "conv_brand",
	type: "group",
	name: "Northwind Clothing (merk)",
	participants: [
		{ id: "u_elena", name: "Elena Hart" },
		{ id: "u_marco", name: "Marco Rossi" },
	],
	last_message_at: "2026-05-22T09:42:00Z",
	last_message_preview:
		"Alle drie de SO-129xx-pakketten zijn bij DHL · track & trace verstuurd.",
	unread_count: 0,
	messages: [
		{
			id: "bmsg_1",
			conversation_id: "conv_brand",
			sender_id: "u_elena",
			sender_name: "Elena Hart",
			body: "Hoi Marco · kun je bevestigen dat SO-12940, 12941 en 12943 vandaag de deur uit gaan?",
			at: "2026-05-22T09:30:00Z",
		},
		{
			id: "bmsg_2",
			conversation_id: "conv_brand",
			sender_id: "u_marco",
			sender_name: "Marco Rossi",
			body: "Alle drie de SO-129xx-pakketten zijn bij DHL · track & trace verstuurd.",
			at: "2026-05-22T09:42:00Z",
		},
	],
};

/* Replies under a message, the way the thread column opens them. */
export const threadsByMessage: Record<string, RichMessage[]> = byScenario<Record<string, RichMessage[]>>({
	empty: {},
	settled: {
		m1: [
			{ id: "t1a", conversation_id: "conv_customer_service", sender_id: "u_henk", sender_name: "Henk", body: "Welk bedrag hebben ze voorgesteld? Dan zet ik het in het sjabloon.", at: todayAt("09:21") },
			{ id: "t1b", conversation_id: "conv_customer_service", sender_id: "u_timo", sender_name: "Timo", body: "De helft terug, ze houden het artikel. Klinkt redelijk voor een retour van €40.", at: todayAt("09:26") },
			{ id: "t1c", conversation_id: "conv_customer_service", sender_id: "u_elena", sender_name: "Elena Hart", body: "Akkoord, ga ervoor. Zet het als notitie bij de zaak zodat we het later terugvinden.", at: todayAt("09:31"), reactions: [{ emoji: "👍", count: 2 }] },
		],
		m3: [
			{ id: "t3a", conversation_id: "conv_customer_service", sender_id: "u_henk", sender_name: "Henk", body: "Ik heb DHL gebeld: het ligt bij de douane, er mist een factuur.", at: todayAt("10:14") },
			{ id: "t3b", conversation_id: "conv_customer_service", sender_id: "u_frost", sender_name: "Frost", body: "Dank je. Ik zet een notitie bij de bestelling.", at: todayAt("10:19") },
		],
	},
});

/* Who is who in the conversations. Some are teammates with a seat, some work with the team. */
export const chatProfiles: Record<string, ChatProfile> = {
	u_elena: { name: "Elena Hart", title: "Eigenaar", email: "elena@northwind.co", timezone: "Europe/Amsterdam", presence: "online", status: "Schrijft een document", memberId: "mem_elena" },
	u_sofia: { name: "Sofía Kim", title: "CX-lead", email: "sofia@northwind.co", timezone: "America/New_York", presence: "online", status: "Beantwoordt ticket #5142", memberId: "mem_sofia" },
	u_liam: { name: "Liam Tucker", title: "Operations", email: "liam@northwind.co", timezone: "Europe/London", presence: "away", status: "Lunch tot 14:00", memberId: "mem_liam" },
	u_maya: { name: "Maya Roy", title: "Marketing", email: "maya@northwind.co", timezone: "Europe/Paris", presence: "offline", memberId: "mem_maya" },
	u_timo: { name: "Timo", title: "Klantenservice", email: "timo@northwind.co", timezone: "Europe/Amsterdam", presence: "online", status: "In de inbox" },
	u_henk: { name: "Henk", title: "Chargebacks", email: "henk@northwind.co", timezone: "Europe/Amsterdam", presence: "online", status: "Werkt aan DSP-2214" },
	u_frost: { name: "Frost", title: "Klantenservice", email: "frost@northwind.co", timezone: "Europe/Berlin", presence: "away" },
	u_marco: { name: "Marco Rossi", title: "Accountmanager · Allure Fulfillment", email: "marco@allure-fulfillment.com", timezone: "Europe/Rome", presence: "online", status: "Op het magazijn" },
	u_jacob: { name: "Jacob", title: "Planner · DPC apparel", email: "jacob@dpc-apparel.com", timezone: "Asia/Shanghai", presence: "offline" },
	u_insyte: { name: "Insyte", title: "AI-collega", timezone: "Europe/Amsterdam", presence: "online", status: "Volgt je regels in Zelfstandigheid", agent: true },
};

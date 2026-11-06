import { byScenario } from "../scenario";
import type { EmailThread } from "@insyte/ui/app/lib/types/domain";

const PARTICIPANTS = [
	{ name: "Maya Patel", email: "maya@northwindclothing.co" },
	{ name: "Elena Hart", email: "elena@northwindclothing.co" },
	{ name: "Daniel Brown", email: "daniel.brown@example.com" },
	{ name: "Maria Garcia", email: "maria.garcia@example.com" },
	{ name: "Chris Lee", email: "chris.lee@example.com" },
];

const SEED_EMAILTHREADS: EmailThread[] = [
	{
		id: "th_1",
		subject: "Re: Waar is mijn bestelling?",
		participants: [PARTICIPANTS[2], PARTICIPANTS[1]],
		last_message_at: "2026-05-22T08:14:00Z",
		last_message_preview:
			"Mijn bestelling van dinsdag is nog steeds niet verzonden. Ik bereid een benefietavond voor · de verwachte...",
		unread: true,
		starred: false,
		labels: ["Probleem met bestelling"],
		ticket_id: "tkt_4001",
		messages: [
			{
				id: "em_1_1",
				thread_id: "th_1",
				from: PARTICIPANTS[2],
				to: [PARTICIPANTS[1]],
				subject: "Waar is mijn bestelling?",
				body_text:
					"Hallo Insyte-team,\n\nMijn bestelling van dinsdag is nog steeds niet verzonden. Ik bereid een benefietavond voor · de verwachte levering was vandaag en ik heb nog geen verzendbevestiging gekregen. Kunnen jullie dit voor me uitzoeken?\n\nBedankt,\nDaniel",
				body_html: "",
				direction: "inbound",
				read: false,
				starred: false,
				attachments: [],
				sent_at: "2026-05-22T08:14:00Z",
			},
		],
	},
	{
		id: "th_2",
		subject: "Groothandelsaanvraag · Allure Boutique",
		participants: [
			{ name: "Allure Boutique", email: "buy@allureboutique.com" },
			PARTICIPANTS[1],
		],
		last_message_at: "2026-05-21T17:42:00Z",
		last_message_preview:
			"Kunnen we een offerte krijgen voor 200 stuks van de Aurora fleece met capuchon in gemengde maten?",
		unread: true,
		starred: true,
		labels: ["Groothandel"],
		messages: [],
	},
	{
		id: "th_3",
		subject: "Re: Retour nooit ontvangen",
		participants: [PARTICIPANTS[3], PARTICIPANTS[0]],
		last_message_at: "2026-05-21T11:00:00Z",
		last_message_preview:
			"Volgens de vervoerder is het pakket bezorgd, maar Maria zegt dat ze het nooit heeft ontvangen.",
		unread: false,
		starred: false,
		labels: ["Retouren"],
		ticket_id: "tkt_4002",
		messages: [],
	},
	{
		id: "th_4",
		subject: "Wachtlijst voor de Cascade pufferjas?",
		participants: [PARTICIPANTS[4], PARTICIPANTS[1]],
		last_message_at: "2026-05-20T15:08:00Z",
		last_message_preview:
			"Ik wil graag op de pre-orderlijst als de nieuwe kleur uitkomt.",
		unread: false,
		starred: false,
		labels: ["VIP"],
		messages: [],
	},
	{
		id: "th_5",
		subject: "Klarna-chargeback geopend · DSP-2214",
		participants: [
			{ name: "Klarna Disputes", email: "disputes@klarna.com" },
			PARTICIPANTS[1],
		],
		last_message_at: "2026-05-20T09:20:00Z",
		last_message_preview:
			"Actie vereist: reageer binnen 14 dagen met onderbouwend bewijs.",
		unread: false,
		starred: true,
		labels: ["Geschillen"],
		messages: [],
	},
	{
		id: "th_6",
		subject: "Re: Beschadigd aangekomen",
		participants: [
			{ name: "Olivier Dubois", email: "olivier@example.com" },
			PARTICIPANTS[0],
		],
		last_message_at: "2026-05-19T14:10:00Z",
		last_message_preview:
			"Foto in de bijlage · de doos kwam geplet aan en de inhoud is beschadigd.",
		unread: false,
		starred: false,
		labels: ["Beschadigd"],
		messages: [],
	},
	{
		id: "th_7",
		subject: "Abonnement pauzeren",
		participants: [
			{ name: "Sofía Méndez", email: "sofia.m@example.com" },
			PARTICIPANTS[0],
		],
		last_message_at: "2026-05-19T08:55:00Z",
		last_message_preview: "Ik ben volgende maand op reis · kunnen we pauzeren tot juli?",
		unread: false,
		starred: false,
		labels: ["Abonnementen"],
		messages: [],
	},
	{
		id: "th_8",
		subject: "Voorstel voor influencersamenwerking",
		participants: [
			{ name: "Priya Singh", email: "priya@creators.studio" },
			PARTICIPANTS[1],
		],
		last_message_at: "2026-05-18T12:30:00Z",
		last_message_preview:
			"Hoi, ik zou Northwind graag in een herfstlookbook laten zien · hierbij mijn mediakit.",
		unread: false,
		starred: false,
		labels: ["Affiliates"],
		messages: [],
	},
	{
		id: "th_9",
		subject: "Re: Vraag over terugbetaling bestelling #12881",
		participants: [
			{ name: "Anoniem", email: "checkout+1@stripe.com" },
			PARTICIPANTS[0],
		],
		last_message_at: "2026-05-18T10:00:00Z",
		last_message_preview: "Hoelang duurt het meestal voordat de terugbetaling binnen is?",
		unread: false,
		starred: false,
		labels: ["Terugbetalingen"],
		messages: [],
	},
	{
		id: "th_10",
		subject: "Trailhead korte broek · vraag over de kleur",
		participants: [
			{ name: "Liam O'Connor", email: "liam@example.com" },
			PARTICIPANTS[1],
		],
		last_message_at: "2026-05-17T17:00:00Z",
		last_message_preview:
			"Is de olijfgroene tint in het echt donkerder? Op de site is dat lastig te zien.",
		unread: false,
		starred: false,
		labels: ["Voor aankoop"],
		messages: [],
	},
	{
		id: "th_11",
		subject: "Twee artikelen retourneren · zelfde RMA?",
		participants: [
			{ name: "Hannah Schmidt", email: "hannah@example.com" },
			PARTICIPANTS[0],
		],
		last_message_at: "2026-05-17T11:00:00Z",
		last_message_preview:
			"Ik wil beide shirts uit bestelling SO-12810 retourneren · kan dat met één RMA?",
		unread: false,
		starred: false,
		labels: ["Retouren"],
		messages: [],
	},
	{
		id: "th_12",
		subject: "Probleem bij het afrekenen",
		participants: [
			{ name: "Bea Williams", email: "bea@example.com" },
			PARTICIPANTS[1],
		],
		last_message_at: "2026-05-16T16:42:00Z",
		last_message_preview:
			"Ik heb drie keer geprobeerd af te rekenen en kreeg elke keer een 500-fout.",
		unread: false,
		starred: false,
		labels: ["Techniek"],
		messages: [],
	},
];

export const emailThreads: EmailThread[] = byScenario({ empty: [], settled: SEED_EMAILTHREADS });

export const aiReplySuggestions: Record<string, string[]> = {
	th_1: [
		"Excuses aanbieden en gratis spoedverzending aanbieden",
		"Vertraging in de afhandeling navragen bij Allure en antwoorden met een verwachte leverdatum",
		"20% korting op de volgende bestelling aanbieden voor het ongemak",
	],
};

import type { ChannelsSeed } from "@insyte/ui/data-source";
import { byScenario, longName } from "../scenario";

/*
 * The inbox's chat channels (PLAN 27, design §4), with the workspace's own customers.
 *
 * A normal Tuesday: WhatsApp on +31 20 808 44 11, Instagram as @northwindclothing and the website
 * chat on Northwind EU, all connected; eight conversations across them — one on WhatsApp outside
 * its 24-hour window, two the website chat's agent answered on its own and one it handed over. The
 * busy week has three hundred, and Instagram has lost its permission. Times measured back from now.
 */

const H = 3_600_000;
const at = (hours: number) => new Date(Date.now() - hours * H).toISOString();

const SETTLED: ChannelsSeed["threads"] = [
	{
		id: "wa_1",
		channel: "whatsapp",
		customer: { name: "Hannah Schmidt", handle: "+49 151 2384 1190" },
		subject: "Ruilen naar een grotere maat",
		unread: true,
		labels: ["Retour"],
		orderRef: "SO-12249",
		messages: [
			{ id: "m1", from: "customer", at: at(2.4), text: "Hoi! Mijn Trailhead korte broek is te klein. Kan ik hem ruilen voor een Middel?" },
			{ id: "m2", from: "customer", at: at(2.3), text: "Bestelling SO-12249" },
		],
	},
	{
		id: "wa_2",
		channel: "whatsapp",
		customer: { name: "Felix Müller", handle: "+49 170 6655 0912" },
		subject: "Harbor regenjas in Groot",
		unread: false,
		labels: ["Voorraad"],
		messages: [
			{ id: "m1", from: "customer", at: at(31), text: "Is de Harbor regenjas weer op voorraad in Groot? Ik wil hem graag voor het weekend." },
			{ id: "m2", from: "team", name: "Sofía Kim", at: at(30.5), text: "Hoi Felix, we verwachten nieuwe voorraad volgende week. Zal ik je een bericht sturen zodra hij er is?", read: true },
			{ id: "m3", from: "customer", at: at(30), text: "Graag!" },
		],
	},
	{
		id: "wa_3",
		channel: "whatsapp",
		customer: { name: "Olivier Dubois", handle: "+33 6 12 44 87 09" },
		subject: "Kleur van de Aurora fleece",
		unread: false,
		labels: [],
		messages: [
			{ id: "m1", from: "customer", at: at(9), text: "Bonjour, is de grijze Aurora fleece meer lichtgrijs of donkergrijs?" },
			{ id: "m2", from: "team", name: "Sofía Kim", at: at(8.6), text: "Hoi Olivier, eerder lichtgrijs met een warme tint. Op de derde foto zie je hem bij daglicht.", read: true },
			{ id: "m3", from: "customer", at: at(8.4), text: "Merci, dan bestel ik hem." },
		],
	},
	{
		id: "ig_1",
		channel: "instagram",
		customer: { name: "Maria Garcia", handle: "@maria.garcia.style" },
		subject: "Cascade pufferjas in olijf",
		unread: true,
		labels: [],
		messages: [{ id: "m1", from: "customer", at: at(1.1), text: "Hebben jullie de Cascade pufferjas ook in olijf? Zag hem in jullie laatste post 😍" }],
	},
	{
		id: "ig_2",
		channel: "instagram",
		customer: { name: "Yuki Tanaka", handle: "@yuki.t" },
		subject: "Reactie op je story",
		unread: false,
		labels: [],
		messages: [
			{ id: "m1", from: "customer", at: at(20), text: "Mooie foto! Waar is deze jas van?" },
			{ id: "m2", from: "team", name: "Maya Roy", at: at(19.5), text: "Dank je! Dat is de Coastline bomberjack, link staat in onze bio.", read: false },
		],
	},
	{
		id: "wc_1",
		channel: "webchat",
		customer: { name: "Astrid Berg", handle: "astrid@example.com" },
		subject: "Waar blijft SO-12224?",
		unread: false,
		labels: ["Levering"],
		storeId: "store_eu",
		orderRef: "SO-12224",
		agent: { state: "handled", at: at(0.7), summary: "Track & trace gedeeld; levering verwacht donderdag." },
		messages: [
			{ id: "m1", from: "customer", at: at(0.8), text: "Hoi, waar blijft mijn bestelling SO-12224?" },
			{ id: "m2", from: "insyte", at: at(0.79), text: "Hoi Astrid, ik zoek het voor je op. Wat is het e-mailadres van de bestelling?" },
			{ id: "m3", from: "customer", at: at(0.78), text: "astrid@example.com" },
			{ id: "m4", from: "insyte", at: at(0.75), text: "Dank je. Je pakket is gisteren bij DHL aangekomen en wordt naar verwachting donderdag bezorgd. Je kunt het hier volgen: JJD000390007199. Kan ik nog iets voor je doen?", read: true },
			{ id: "m5", from: "customer", at: at(0.7), text: "Nee, top, dank je!" },
		],
	},
	{
		id: "wc_2",
		channel: "webchat",
		customer: { name: "Liam O'Connor", handle: "liam@example.com" },
		subject: "Geld terug voor een sale-artikel",
		unread: true,
		labels: [],
		storeId: "store_eu",
		orderRef: "SO-12250",
		agent: { state: "handed_over", at: at(0.25), reason: "Klant vraagt om een terugbetaling buiten de termijn", summary: "Liam wil zijn Meridian rugzak (SO-12250) terugbetaald; bezorgd 27 dagen geleden, sale-artikel, dus niet retourneerbaar volgens de regels." },
		messages: [
			{ id: "m1", from: "customer", at: at(0.4), text: "Ik wil mijn geld terug voor de rugzak, hij past niet over mijn schouders." },
			{ id: "m2", from: "insyte", at: at(0.38), text: "Hoi Liam, dat is vervelend. Mag ik je bestelnummer en e-mailadres?" },
			{ id: "m3", from: "customer", at: at(0.33), text: "SO-12250, liam@example.com" },
			{ id: "m4", from: "insyte", at: at(0.25), text: "Dank je. Hier kijkt een collega graag even naar: je hoort vandaag nog van ons, hier in de chat of per mail.", read: true },
		],
	},
	{
		id: "wc_3",
		channel: "webchat",
		customer: { name: "Nina Petrova", handle: "nina@example.com" },
		subject: "Verzending naar Polen",
		unread: false,
		labels: [],
		storeId: "store_eu",
		agent: { state: "handled", at: at(3), summary: "Levertijd naar Polen uit de kennisbank: 4–6 werkdagen." },
		messages: [
			{ id: "m1", from: "customer", at: at(3.1), text: "Do you ship to Poland, and how long does it take?" },
			{ id: "m2", from: "insyte", at: at(3.05), text: "Hi Nina, yes we do. Orders to Poland arrive in 4–6 working days, shipping is free above €75.", read: true },
			{ id: "m3", from: "customer", at: at(3), text: "Great, thanks!" },
		],
	},
];

const BUSY_TEXT = [
	"Hoi, mijn bestelling staat al vijf dagen op ‘onderweg’ bij de vervoerder en ik heb hem volgend weekend echt nodig voor een bruiloft, kunnen jullie even kijken?",
	"Ik heb twee keer dezelfde jas besteld door een fout in de kassa, kan één bestelling geannuleerd worden voordat hij verzonden is?",
	"Klopt het dat de maattabel voor de broeken anders is dan die voor de jassen? Ik twijfel tussen Middel en Groot.",
];

const busy = (): ChannelsSeed["threads"] =>
	Array.from({ length: 300 }, (_, i) => {
		const channel = (["whatsapp", "instagram", "webchat"] as const)[i % 3]!;
		const name = longName(i + 3);
		const hours = 0.2 + i * 0.6;
		return {
			id: `ch_${i}`,
			channel,
			customer: { name, handle: channel === "instagram" ? `@${name.split(" ")[0]!.toLowerCase()}.${i}` : channel === "whatsapp" ? `+31 6 ${String(10000000 + i * 7919).slice(0, 8)}` : `klant${i}@voorbeeldmail.nl` },
			subject: BUSY_TEXT[i % 3]!.slice(0, 60),
			unread: i % 4 === 0,
			labels: i % 5 === 0 ? ["Levering"] : [],
			storeId: "store_eu",
			agent: channel === "webchat" ? { state: i % 6 === 2 ? ("handed_over" as const) : ("handled" as const), at: new Date(Date.now() - hours * H).toISOString(), reason: i % 6 === 2 ? "Klant vraagt om een collega" : undefined } : undefined,
			messages: [
				{ id: "m1", from: "customer" as const, at: new Date(Date.now() - hours * H).toISOString(), text: BUSY_TEXT[i % 3]! },
				...(i % 2 ? [{ id: "m2", from: channel === "webchat" ? ("insyte" as const) : ("team" as const), name: channel === "webchat" ? undefined : "Sofía Kim", at: new Date(Date.now() - (hours - 0.1) * H).toISOString(), text: "Dank je voor je bericht, we kijken het meteen na en komen er vandaag bij je op terug.", read: i % 4 === 1 }] : []),
			],
		};
	});

const TEMPLATES: ChannelsSeed["templates"] = [
	{ id: "tpl_order", name: "bestelling_update", label: "Nieuws over je bestelling", body: "Hoi {{naam}}, er is nieuws over {{order}}. Antwoord op dit bericht, dan helpen we je verder.", status: "approved" },
	{ id: "tpl_stock", name: "weer_op_voorraad", label: "Weer op voorraad", body: "Hoi {{naam}}, het artikel waar je naar vroeg is weer op voorraad. Wil je dat we het voor je reserveren?", status: "approved" },
	{ id: "tpl_followup", name: "vraag_opvolgen", label: "Je vraag opvolgen", body: "Hoi {{naam}}, we hebben je vraag niet vergeten. Heb je nog even? Antwoord op dit bericht om verder te praten.", status: "approved" },
	{ id: "tpl_review", name: "review_vragen", label: "Om een review vragen", body: "Hoi {{naam}}, hoe bevalt {{order}}? We horen het graag.", status: "pending" },
];

export const channelsSeed: ChannelsSeed = byScenario<ChannelsSeed>({
	empty: {
		threads: [],
		accounts: {
			whatsapp: { status: "disconnected", account: "", detail: "WhatsApp Business via Meta" },
			instagram: { status: "disconnected", account: "", detail: "Berichten van je Instagram-bedrijfsaccount" },
			webchat: { status: "disconnected", account: "", detail: "Chat op je Shopify-winkel" },
		},
		templates: [],
	},
	settled: {
		threads: SETTLED,
		accounts: {
			whatsapp: { status: "connected", account: "+31 20 808 44 11", detail: "WhatsApp Business via Meta" },
			instagram: { status: "connected", account: "@northwindclothing", detail: "Berichten van je Instagram-bedrijfsaccount" },
			webchat: { status: "connected", account: "Northwind EU", detail: "Chat op je Shopify-winkel" },
		},
		templates: TEMPLATES,
	},
	busy: () => ({
		threads: busy(),
		accounts: {
			whatsapp: { status: "connected", account: "+31 20 808 44 11", detail: "WhatsApp Business via Meta" },
			instagram: { status: "action_required", account: "@northwindclothing", detail: "Berichten van je Instagram-bedrijfsaccount" },
			webchat: { status: "connected", account: "Northwind EU, Northwind US en Northwind UK", detail: "Chat op je Shopify-winkel" },
		},
		templates: TEMPLATES,
	}),
});

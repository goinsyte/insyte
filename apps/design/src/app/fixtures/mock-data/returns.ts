import type { ReturnRecord, ReturnSettings } from "@insyte/ui/data-source";
import type { Order } from "@insyte/ui/app/lib/types/domain";
import { orders } from "./orders";
import { products } from "./products";
import { byScenario, longName } from "../scenario";

/*
 * Returns and claims (PLAN 25, design §1), on the workspace's own orders and products.
 *
 * A normal Tuesday holds fourteen, one or more in every state: three to review — Bea Williams'
 * Cascade pufferjas to swap for a size up (R-1042, what the portal flow makes), Olivier Dubois'
 * return past its review deadline and outside the window, which the agent flagged, and Felix
 * Müller's claim on a Harbor regenjas with a torn seam — then parcels on their way, one received,
 * one ready, four resolved and one rejected. Times are measured back from now; the window counts
 * from the delivery date each order is given here (`deliveriesSeed`).
 */

const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();

/** When each sent order arrived, measured back from now, so the windows read true today. */
const DELIVERED_DAYS: Record<string, number> = {
	ord_5001: 4, ord_5002: 9, ord_5007: 21, ord_5008: 11, ord_5013: 6, ord_5014: 16, ord_5019: 13, ord_5020: 25,
	ord_5025: 2, ord_5026: 74, ord_5031: 6, ord_5032: 18, ord_5037: 3, ord_5038: 8, ord_5043: 5, ord_5044: 33,
	ord_5049: 12, ord_5050: 27, ord_5055: 1, ord_5056: 29,
};

const sent = () => orders.filter((o) => o.status === "delivered" || o.status === "shipped");

export const deliveriesSeed: Record<string, string> = byScenario({
	empty: {},
	settled: Object.fromEntries(Object.entries(DELIVERED_DAYS).map(([id, d]) => [id, iso(now - d * D)])),
	busy: () => Object.fromEntries(sent().map((o, i) => [o.id, iso(now - (DELIVERED_DAYS[o.id] ?? (i * 7) % 45) * D)])),
});

const photo = (productId: string, i = 0) => products.find((p) => p.id === productId)?.images[i] ?? "";
const titleOf = (productId: string) => products.find((p) => p.id === productId)?.title ?? productId;
const SIZE: Record<string, string> = { s: "Klein", m: "Middel", l: "Groot" };

type Spec = {
	n: number;
	order: string;
	kind: ReturnRecord["kind"];
	product: string;
	qty?: number;
	reason: ReturnRecord["reason"];
	note: string;
	requested: ReturnRecord["requested"];
	exchangeTo?: string;
	status: ReturnRecord["status"];
	hoursAgo: number;
	photos?: number;
	label?: ReturnRecord["label"];
	events?: ReturnRecord["events"];
	resolution?: ReturnRecord["resolution"];
	rejectReason?: string;
	assignee?: string;
	tags?: string[];
};

function build(o: Order, s: Spec): ReturnRecord {
	const line = o.line_items.find((l) => l.product_id === s.product) ?? o.line_items[0]!;
	const created = now - s.hoursAgo * H;
	const delivered = now - (DELIVERED_DAYS[o.id] ?? 10) * D;
	const items = [{ lineId: line.id, productId: line.product_id, variantId: line.variant_id, title: titleOf(line.product_id), variantTitle: SIZE[line.variant_id.slice(-1)] ?? line.variant_title, qty: s.qty ?? 1, unitPrice: line.unit_price }];
	return {
		id: `ret_${s.n}`,
		number: `R-${s.n}`,
		kind: s.kind,
		orderId: o.id,
		orderNumber: o.number,
		customerId: o.customer_id,
		customerName: o.customer_name,
		customerEmail: o.customer_email,
		storeId: o.store_id,
		country: o.shipping_address?.country ?? "NL",
		currency: o.currency,
		items,
		reason: s.reason,
		note: s.note,
		photos: Array.from({ length: s.photos ?? 0 }, (_, i) => photo(line.product_id, i)).filter(Boolean),
		requested: s.requested,
		exchangeTo: s.exchangeTo,
		status: s.status,
		createdAt: iso(created),
		deadline: iso(created + 48 * H),
		deliveredAt: iso(delivered),
		label: s.label,
		assignee: s.assignee,
		quality: s.reason === "quality" || s.reason === "damaged",
		tags: s.tags ?? [],
		resolution: s.resolution,
		rejectReason: s.rejectReason,
		events: [{ at: iso(created), who: "shopper", name: o.customer_name, text: s.kind === "claim" ? "Claim gemeld in het retourportaal" : "Retour aangevraagd in het retourportaal" }, ...(s.events ?? [])],
	};
}

const at = (h: number) => iso(now - h * H);

const SPECS: Spec[] = [
	{ n: 1042, order: "ord_5031", kind: "return", product: "prod_2018", reason: "too_small", note: "Valt kleiner dan verwacht, vooral over de schouders. Graag een maat groter.", requested: "exchange", exchangeTo: "Middel", status: "review", hoursAgo: 3 },
	{
		n: 1041, order: "ord_5026", kind: "return", product: "prod_2000", reason: "not_as_expected", note: "De kleur is in het echt veel grijzer dan op de foto.", requested: "refund", status: "review", hoursAgo: 52,
		events: [{ at: at(51), who: "insyte", text: "Notitie: buiten termijn, bezorgd 74 dagen geleden (termijn 30 dagen)" }],
		tags: ["buiten-termijn"],
	},
	{ n: 1040, order: "ord_5008", kind: "claim", product: "prod_2010", reason: "quality", note: "De naad bij de linkerschouder is gescheurd na twee keer dragen. Foto's erbij.", requested: "replacement", status: "review", hoursAgo: 6, photos: 2, assignee: "mem_sofia" },
	{
		n: 1039, order: "ord_5019", kind: "return", product: "prod_2005", reason: "too_big", note: "Te ruim in de taille.", requested: "refund", status: "awaiting_parcel", hoursAgo: 30,
		label: { carrier: "DPD", tracking: "05222947311842", sentAt: at(28) },
		events: [{ at: at(29), who: "team", name: "Sofía Kim", text: "Goedgekeurd" }, { at: at(28), who: "team", name: "Sofía Kim", text: "Retourlabel van DPD verstuurd" }],
	},
	{
		n: 1038, order: "ord_5049", kind: "return", product: "prod_2015", reason: "too_big", note: "Te groot, ik wil graag mijn geld terug.", requested: "refund", status: "awaiting_parcel", hoursAgo: 20,
		label: { carrier: "DHL", tracking: "JJD000390007124530", sentAt: at(19) },
		events: [{ at: at(19.5), who: "team", name: "Sofía Kim", text: "Goedgekeurd" }, { at: at(19), who: "team", name: "Sofía Kim", text: "Retourlabel van DHL verstuurd" }],
	},
	{
		n: 1037, order: "ord_5038", kind: "claim", product: "prod_2013", reason: "damaged", note: "Een van de gespen is afgebroken bij aankomst.", requested: "replacement", status: "in_transit", hoursAgo: 70, photos: 1,
		label: { carrier: "PostNL", tracking: "3SNWD0018273645", sentAt: at(66) },
		events: [{ at: at(68), who: "team", name: "Sofía Kim", text: "Goedgekeurd: nieuw artikel na ontvangst" }, { at: at(66), who: "team", name: "Sofía Kim", text: "Retourlabel van PostNL verstuurd" }, { at: at(20), who: "carrier", name: "PostNL", text: "Pakket aangenomen bij een PostNL-punt" }],
	},
	{
		n: 1036, order: "ord_5032", kind: "return", product: "prod_2003", reason: "too_small", note: "Mouwen te kort.", requested: "exchange", exchangeTo: "Middel", status: "received", hoursAgo: 120,
		label: { carrier: "PostNL", tracking: "3SNWD0018270011", sentAt: at(118) },
		events: [{ at: at(119), who: "team", name: "Ethan Jeppesen", text: "Goedgekeurd" }, { at: at(118), who: "team", name: "Ethan Jeppesen", text: "Retourlabel van PostNL verstuurd" }, { at: at(40), who: "carrier", name: "PostNL", text: "Bezorgd bij het retouradres" }, { at: at(6), who: "team", name: "Liam Tucker", text: "Ontvangen gemarkeerd" }],
	},
	{
		n: 1035, order: "ord_5014", kind: "return", product: "prod_2000", reason: "too_big", note: "Valt erg groot.", requested: "gift_card", status: "ready", hoursAgo: 150,
		label: { carrier: "UPS", tracking: "1Z999AA10123456784", sentAt: at(148) },
		events: [{ at: at(149), who: "team", name: "Sofía Kim", text: "Goedgekeurd" }, { at: at(60), who: "carrier", name: "UPS", text: "Bezorgd bij het retouradres" }, { at: at(30), who: "team", name: "Liam Tucker", text: "Ontvangen en gecontroleerd: in orde" }],
	},
	{
		n: 1034, order: "ord_5044", kind: "claim", product: "prod_2010", reason: "quality", note: "Rits trekt los van de stof na een week.", requested: "replacement", status: "resolved", hoursAgo: 260, photos: 2,
		resolution: { kind: "replacement", amount: 220, at: at(240), by: "Sofía Kim", replacementOrder: "SO-12261" },
		events: [{ at: at(250), who: "team", name: "Sofía Kim", text: "Goedgekeurd: nieuw artikel zonder terugsturen" }, { at: at(240), who: "team", name: "Sofía Kim", text: "Afgehandeld: nieuw artikel, bestelling SO-12261" }],
	},
	{
		n: 1033, order: "ord_5056", kind: "return", product: "prod_2017", reason: "too_small", note: "Te klein.", requested: "refund", status: "resolved", hoursAgo: 330,
		resolution: { kind: "refund", amount: 92, at: at(300), by: "Elena Hart" },
		events: [{ at: at(320), who: "team", name: "Elena Hart", text: "Goedgekeurd" }, { at: at(300), who: "team", name: "Elena Hart", text: "Terugbetaald op de oorspronkelijke betaalmethode" }],
	},
	{
		n: 1032, order: "ord_5020", kind: "return", product: "prod_2003", reason: "not_as_expected", note: "Stof dunner dan ik dacht.", requested: "exchange", exchangeTo: "Groot", status: "resolved", hoursAgo: 410,
		resolution: { kind: "exchange", amount: 0, at: at(380), by: "Ethan Jeppesen", replacementOrder: "SO-12262" },
		events: [{ at: at(400), who: "team", name: "Ethan Jeppesen", text: "Goedgekeurd" }, { at: at(380), who: "team", name: "Ethan Jeppesen", text: "Afgehandeld: geruild naar Groot, bestelling SO-12262" }],
	},
	{
		n: 1031, order: "ord_5007", kind: "claim", product: "prod_2018", reason: "wrong_item", note: "Ik kreeg een zwarte in plaats van de olijfgroene.", requested: "replacement", status: "resolved", hoursAgo: 500, photos: 1,
		resolution: { kind: "replacement", amount: 235, at: at(470), by: "Sofía Kim", replacementOrder: "SO-12263" },
		events: [{ at: at(490), who: "team", name: "Sofía Kim", text: "Goedgekeurd: nieuw artikel na ontvangst" }, { at: at(470), who: "team", name: "Sofía Kim", text: "Afgehandeld: nieuw artikel, bestelling SO-12263" }],
	},
	{
		n: 1030, order: "ord_5001", kind: "return", product: "prod_2008", reason: "too_small", note: "Te strak.", requested: "refund", status: "rejected", hoursAgo: 90,
		rejectReason: "Sale-artikelen kun je niet retourneren. Ruilen kan wel, binnen 30 dagen.",
		events: [{ at: at(80), who: "team", name: "Sofía Kim", text: "Afgewezen: sale-artikel" }],
		tags: ["sale"],
	},
	{
		n: 1029, order: "ord_5050", kind: "return", product: "prod_2013", reason: "not_as_expected", note: "Past niet goed over mijn schouders.", requested: "gift_card", status: "awaiting_parcel", hoursAgo: 8,
		label: { carrier: "PostNL", tracking: "3SNWD0018279902", sentAt: at(7) },
		events: [{ at: at(7.5), who: "insyte", text: "Label Retour toegevoegd en toegewezen aan Sofía Kim" }, { at: at(7), who: "team", name: "Sofía Kim", text: "Goedgekeurd en retourlabel van PostNL verstuurd" }],
		assignee: "mem_sofia",
	},
];

const byId = () => new Map(orders.map((o) => [o.id, o]));

const settled = (): ReturnRecord[] => {
	const m = byId();
	return SPECS.flatMap((s) => {
		const o = m.get(s.order);
		return o ? [build(o, s)] : [];
	});
};

/* The busy week: 180 across every state, several countries, long names and longer reasons. */
const BUSY_NOTES = [
	"Het artikel valt een volle maat kleiner dan de maattabel aangeeft en knelt onder de armen, ook na het wassen op dertig graden zoals op het label staat",
	"Bij aankomst zat er een vlek op de voorkant die er met water niet uit ging; de verpakking was aan één kant open",
	"De kleur wijkt flink af van de foto's op de website: in daglicht is hij eerder bruin dan olijfgroen",
	"Ik heb per ongeluk twee keer dezelfde maat besteld en wil er één terugsturen voor geld terug",
];
const busy = (): ReturnRecord[] => {
	const list = sent();
	const statuses: ReturnRecord["status"][] = ["review", "awaiting_parcel", "in_transit", "received", "ready", "resolved", "resolved", "rejected"];
	return Array.from({ length: 180 }, (_, i) => {
		const o = list[i % list.length]!;
		const st = statuses[i % statuses.length]!;
		const r = build({ ...o, customer_name: i % 3 === 0 ? longName(i) : o.customer_name }, {
			n: 2000 + i,
			order: o.id,
			kind: i % 5 === 0 ? "claim" : "return",
			product: o.line_items[i % o.line_items.length]!.product_id,
			qty: 1 + (i % 2),
			reason: (["too_small", "too_big", "not_as_expected", "damaged", "wrong_item", "quality"] as const)[i % 6]!,
			note: BUSY_NOTES[i % BUSY_NOTES.length]!,
			requested: (["refund", "exchange", "gift_card", "refund", "replacement"] as const)[i % 5]!,
			status: st,
			hoursAgo: 1 + i * 3,
			label: st === "review" || st === "rejected" ? undefined : { carrier: (["PostNL", "DHL", "DPD", "UPS"] as const)[i % 4]!, tracking: `3SNWD00${18000000 + i * 37}`, sentAt: iso(now - (i * 3) * H) },
			resolution: st === "resolved" ? { kind: "refund", amount: o.line_items[0]!.unit_price, at: iso(now - i * 2 * H), by: longName(i + 20) } : undefined,
			rejectReason: st === "rejected" ? "Buiten de retourtermijn van 30 dagen en geen kwaliteitsprobleem gemeld" : undefined,
		});
		return { ...r, country: ["NL", "DE", "BE", "FR", "AT", "US"][i % 6]! };
	});
};

export const returnsSeed: ReturnRecord[] = byScenario({ empty: [], settled: settled(), busy });

const SETTINGS: ReturnSettings = {
	returnDays: 30,
	claimDays: 60,
	specialWindows: [{ id: "feestdagen", label: "Feestdagen", days: 60, from: "11-15", to: "12-24" }],
	reasons: [
		{ id: "too_small", label: "Te klein", claim: false, photoRequired: false, quality: false },
		{ id: "too_big", label: "Te groot", claim: false, photoRequired: false, quality: false },
		{ id: "not_as_expected", label: "Anders dan verwacht", claim: false, photoRequired: false, quality: false },
		{ id: "damaged", label: "Beschadigd aangekomen", claim: true, photoRequired: true, quality: true, windowDays: 14 },
		{ id: "wrong_item", label: "Verkeerd artikel", claim: true, photoRequired: true, quality: false, windowDays: 14 },
		{ id: "quality", label: "Kwaliteit", claim: true, photoRequired: true, quality: true },
	],
	rules: [
		{ id: "rule_sale", kind: "not_returnable", target: { by: "tag", tag: "sale" }, note: "Sale-artikelen kun je niet retourneren. Ruilen kan wel." },
		{ id: "rule_beanie", kind: "not_returnable", target: { by: "product", productId: "prod_2002", label: "Mariner wollen muts" }, note: "Mutsen nemen we om hygiënische redenen niet terug." },
		{ id: "rule_wallet", kind: "refund_only", target: { by: "product", productId: "prod_2019", label: "Granite portemonnee" }, note: "Portemonnees ruilen we niet; je krijgt je geld terug." },
	],
	offered: ["refund", "exchange", "gift_card", "replacement", "discount"],
	giftCardBonus: 10,
	exchangeFee: 0,
	addresses: [
		{ country: "NL", label: "Nederland en België", address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam", carrier: "PostNL" },
		{ country: "DE", label: "Duitsland en Oostenrijk", address: "Northwind Returns c/o Allure Fulfillment, Lagerstraße 4, 41460 Neuss", carrier: "DHL" },
		{ country: "FR", label: "Frankrijk", address: "Northwind Retours, 18 rue des Entrepôts, 59000 Lille", carrier: "DPD" },
		{ country: "US", label: "Verenigde Staten", address: "Northwind Returns, 410 Harbor Blvd, Newark NJ 07114", carrier: "UPS" },
	],
	claimSteps: ["Wat is er mis", "Foto's van het artikel en de verpakking", "Wat wil je dat we doen"],
	portal: {
		on: true,
		handle: "northwind-eu",
		intro: "Iets terugsturen of een probleem melden? Vul je bestelnummer en e-mailadres in.",
		done: "We bekijken je aanvraag binnen twee werkdagen. Je krijgt een mail met het retourlabel zodra we hem hebben goedgekeurd.",
	},
};

/** On the first day the portal is not switched on yet: that is the empty page's first step. */
export const returnSettingsSeed: ReturnSettings = byScenario({ empty: { ...SETTINGS, portal: { ...SETTINGS.portal, on: false } }, settled: SETTINGS });

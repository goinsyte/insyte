import { SCENARIO } from "../../../data-source";
import { products } from "../../../data-source";
import { stores } from "../../../data-source";
import { suppliers } from "../../../data-source";

/**
 * The store's history as Shopify, the carriers and the help desk report it: every order since
 * 1 January, when it was delivered against when it was promised, what came back and why, the
 * disputes, and the support tickets with how long they took.
 *
 * It is generated, deterministically, because the workspace's sixty live orders are too few to
 * read a month from. What the analytics say is computed from these rows and nothing else, so every
 * figure on the page, and every sentence Insyte writes about one, can be taken apart down to the
 * orders it counts. A handful of things happened in these five months, set by the levers below
 * rather than by chance, so there is something true to find:
 *
 * - Aurora fleece met capuchon sold out in the EU store from 14 April to 6 May.
 * - From 1 May, Kestrel Goods parcels to Germany were held at customs for about three days.
 * - A batch of the Trailhead korte broek from 20 April ran a size small, and came back as "Wrong size".
 * - Cascade pufferjas is a winter coat, and sells like one.
 * - The UK store's Klaviyo flows started in March and its orders have grown since.
 * - Weekend tickets wait longer, because the team works weekdays.
 */

export type Channel = "Meta ads" | "Klaviyo" | "Google" | "Organic";
export type Country = "US" | "DE" | "FR" | "NL" | "ES" | "GB";
export type RefundReason = "Wrong size" | "Damaged" | "Not as pictured" | "Changed mind" | "Late delivery";
export type DisputeReason = "Item not received" | "Not as described" | "Unauthorized" | "Duplicate charge" | "Other";
export type TicketTopic = "Where is my order" | "Returns" | "Sizing" | "Payment" | "Product question";

export type HistOrder = {
	id: string;
	number: string;
	/** Day of the order, YYYY-MM-DD, in the store's time. */
	day: string;
	at: string;
	store: string;
	country: Country;
	product: string;
	title: string;
	supplier: string;
	qty: number;
	total: number;
	channel: Channel;
	customer: string;
	firstOrder: boolean;
	/** Days the checkout promised. */
	promised: number;
	/** Days it took, once delivered. */
	took?: number;
	/** The day it was delivered, YYYY-MM-DD. */
	arrived?: string;
	status: "delivered" | "in_transit" | "refunded" | "cancelled";
	refundReason?: RefundReason;
};

export type HistDispute = {
	id: string;
	day: string;
	order: string;
	reason: DisputeReason;
	amount: number;
	supplier: string;
	country: Country;
};

export type HistTicket = {
	id: string;
	day: string;
	weekday: number;
	topic: TicketTopic;
	/** Hours to the first reply. */
	firstH: number;
	/** Hours to resolved. */
	resolveH: number;
	order?: string;
};

/** The last moment the history covers: the evening of 26 May 2026, the workspace's today. */
export const HISTORY_END = "2026-05-26";
const START = Date.UTC(2026, 0, 1);
const DAYS = Math.round((Date.UTC(2026, 4, 26) - START) / 86_400_000) + 1;

function mulberry(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const iso = (d: number) => new Date(START + d * 86_400_000).toISOString().slice(0, 10);

function pick<T>(r: () => number, items: ReadonlyArray<readonly [T, number]>): T {
	const total = items.reduce((n, [, w]) => n + w, 0);
	let x = r() * total;
	for (const [v, w] of items) {
		x -= w;
		if (x <= 0) return v;
	}
	return items[items.length - 1]![0];
}

const PROMISE: Record<Country, number> = { US: 5, DE: 6, FR: 6, NL: 5, ES: 7, GB: 6 };
const COUNTRIES: Record<string, ReadonlyArray<readonly [Country, number]>> = {
	store_us: [["US", 1]],
	store_eu: [["DE", 40], ["FR", 25], ["NL", 20], ["ES", 15]],
	store_uk: [["GB", 1]],
};

const AURORA = "prod_2000";
const TRAILHEAD = "prod_2008";
const PUFFER = "prod_2018";
const LINEN = "prod_2009";
const AURORA_OUT = [iso(103), iso(125)] as const; // 14 April … 6 May

function productWeight(id: string, store: string, d: number, day: string): number {
	const winter = Math.max(0, 1 - d / 90); // Jan → end of March, falling to nothing
	if (id === AURORA) return store === "store_eu" && day >= AURORA_OUT[0] && day <= AURORA_OUT[1] ? 0 : 14;
	if (id === PUFFER) return 0.6 + 6 * winter;
	if (id === LINEN) return 1 + 3 * Math.max(0, (d - 90) / 56); // April on
	if (id === TRAILHEAD) return 1.5 + 2.5 * Math.max(0, (d - 80) / 66);
	return 2;
}

function build() {
	const r = mulberry(20260526);
	const live = products.filter((p) => p.status === "active");
	const orders: HistOrder[] = [];
	const disputes: HistDispute[] = [];
	const tickets: HistTicket[] = [];
	const customersBy: Record<string, string[]> = { store_us: [], store_eu: [], store_uk: [] };
	let seq = 0;
	let custSeq = 0;

	for (let d = 0; d < DAYS; d++) {
		const day = iso(d);
		const weekday = new Date(START + d * 86_400_000).getUTCDay();
		const weekend = weekday === 0 || weekday === 6;
		const week = 1 + (weekend ? 0.16 : weekday === 1 ? 0.05 : 0);
		const base: Record<string, number> = {
			store_us: 27,
			store_eu: 21,
			// Klaviyo flows switched on on 2 March; the UK store grows from there.
			store_uk: 7.5 * (d < 60 ? 1 : 1 + (d - 60) * 0.012),
		};
		for (const store of ["store_us", "store_eu", "store_uk"]) {
			const expected = base[store]! * week;
			const n = Math.max(0, Math.round(expected + (r() - 0.5) * expected * 0.4));
			for (let k = 0; k < n; k++) {
				const weights = live.map((p) => [p, productWeight(p.id, store, d, day)] as const);
				const p = pick(r, weights);
				const country = pick(r, COUNTRIES[store]!);
				const q = r();
				const qty = q < 0.85 ? 1 : q < 0.98 ? 2 : 3;
				const channel = pick<Channel>(r, [
					["Meta ads", 38],
					["Google", 18],
					["Organic", 26],
					["Klaviyo", store === "store_uk" && d >= 60 ? 30 : 12],
				]);
				const pool = customersBy[store]!;
				const repeat = pool.length > 20 && r() < 0.28;
				const customer = repeat ? pool[Math.floor(r() * pool.length)]! : `hc_${++custSeq}`;
				if (!repeat) pool.push(customer);
				const promised = PROMISE[country];
				let took = promised - 1 + Math.round((r() + r() + r() - 1.5) * 2);
				// From 1 May, Kestrel parcels to Germany sit in customs for about three days.
				if (p.supplier_id === "sup_kestrel" && country === "DE" && day >= "2026-05-01") took += 3 + Math.round(r() * 2);
				took = Math.max(2, took);
				const arrives = d + took;
				seq += 1;
				const o: HistOrder = {
					id: `h_${seq}`,
					number: `NW-${String(30000 + seq)}`,
					day,
					at: `${day}T${String(7 + Math.floor(r() * 15)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00Z`,
					store,
					country,
					product: p.id,
					title: p.title,
					supplier: p.supplier_id ?? "sup_allure",
					qty,
					total: p.price * qty,
					channel,
					customer,
					firstOrder: !repeat,
					promised,
					status: "delivered",
				};
				if (r() < 0.012) o.status = "cancelled";
				else if (arrives > DAYS - 1) o.status = "in_transit";
				else {
					o.took = took;
					o.arrived = iso(arrives);
					const late = took - promised;
					const small = p.id === TRAILHEAD && day >= "2026-04-20";
					const refundP = 0.035 + (small ? 0.22 : 0) + (late > 2 ? 0.05 : 0);
					if (r() < refundP) {
						o.status = "refunded";
						o.refundReason = small && r() < 0.85
							? "Wrong size"
							: late > 2 && r() < 0.6
								? "Late delivery"
								: pick<RefundReason>(r, [["Wrong size", 2], ["Damaged", 3], ["Not as pictured", 2], ["Changed mind", 4]]);
					}
					const disputeP = 0.003 + (late > 2 ? 0.1 : 0);
					if (r() < disputeP) {
						disputes.push({
							id: `hd_${disputes.length + 1}`,
							day: iso(Math.min(DAYS - 1, d + took + 4 + Math.floor(r() * 8))),
							order: o.id,
							reason: late > 2 && r() < 0.8 ? "Item not received" : pick<DisputeReason>(r, [["Not as described", 3], ["Unauthorized", 2], ["Duplicate charge", 1], ["Other", 2]]),
							amount: o.total,
							supplier: o.supplier,
							country,
						});
					}
				}
				orders.push(o);

				// About one order in nine writes in; a late or small one far more often.
				const lateNow = o.took !== undefined && o.took - o.promised > 1;
				const ticketP = 0.05 + (lateNow ? 0.35 : 0) + (o.refundReason === "Wrong size" ? 0.5 : 0);
				if (r() < ticketP) {
					const td = Math.min(DAYS - 1, d + Math.floor(r() * (o.took ?? 4)));
					const tw = new Date(START + td * 86_400_000).getUTCDay();
					const slow = tw === 0 || tw === 6;
					tickets.push({
						id: `ht_${tickets.length + 1}`,
						day: iso(td),
						weekday: tw,
						topic: lateNow ? "Where is my order" : o.refundReason === "Wrong size" ? "Sizing" : pick<TicketTopic>(r, [["Returns", 3], ["Payment", 1], ["Product question", 4], ["Where is my order", 2]]),
						firstH: Math.round((slow ? 5.5 : 2.1) * (0.6 + r() * 0.8) * 10) / 10,
						resolveH: Math.round((slow ? 8.8 : 3.6) * (0.6 + r() * 0.8) * 10) / 10,
						order: o.id,
					});
				}
			}
		}
	}
	return { orders, disputes, tickets };
}

// The first day has no history yet.
export const HISTORY: ReturnType<typeof build> = SCENARIO === "empty" ? { orders: [], disputes: [], tickets: [] } : build();

export const STORE_NAME: Record<string, string> = Object.fromEntries(stores.map((s) => [s.id, s.name]));
export const SUPPLIER_NAME: Record<string, string> = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
export const COUNTRY_NAME: Record<Country, string> = {
	US: "Verenigde Staten",
	DE: "Duitsland",
	FR: "Frankrijk",
	NL: "Nederland",
	ES: "Spanje",
	GB: "Verenigd Koninkrijk",
};

/** The country as it reads inside a sentence: "naar de Verenigde Staten". */
export const COUNTRY_IN: Record<Country, string> = {
	...COUNTRY_NAME,
	US: "de Verenigde Staten",
	GB: "het Verenigd Koninkrijk",
};

/** Display text for the reasons and topics; the union members stay the keys the code compares. */
export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
	"Wrong size": "Verkeerde maat",
	Damaged: "Beschadigd",
	"Not as pictured": "Anders dan op de foto",
	"Changed mind": "Bedacht",
	"Late delivery": "Te late levering",
};
export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
	"Item not received": "Niet ontvangen",
	"Not as described": "Niet zoals beschreven",
	Unauthorized: "Niet geautoriseerd",
	"Duplicate charge": "Dubbele afschrijving",
	Other: "Overig",
};
export const TICKET_TOPIC_LABEL: Record<TicketTopic, string> = {
	"Where is my order": "Waar is mijn bestelling",
	Returns: "Retouren",
	Sizing: "Maatvoering",
	Payment: "Betaling",
	"Product question": "Productvraag",
};
export const CHANNEL_LABEL: Record<Channel, string> = {
	"Meta ads": "Meta-advertenties",
	Klaviyo: "Klaviyo",
	Google: "Google",
	Organic: "Organisch",
};

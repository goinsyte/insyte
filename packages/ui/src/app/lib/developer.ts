import { type ApiAccess, type AreaId, AREA_BY_ID, API_AREAS, type StoreScope } from "./permissions";
import { type ApiKey, type ApiRequest, D, H, type KeyAccess, randomHex } from "./developer-core";

export {
	type ApiKey,
	type ApiRequest,
	EXPIRY,
	type ExpiryState,
	expiryState,
	GRACE,
	IP,
	isRestricted,
	type KeyAccess,
	keyScopes,
	newPrefix,
	randomHex,
	scopeSummary,
} from "./developer-core";

import { byScenario, longName } from "../../data-source";

/*
 * What the console offers to code that is not a person: API keys that scripts sign in with, and
 * webhook endpoints Insyte posts events to. Everything here is simulated — the request log of a key,
 * the deliveries to an endpoint and their payloads are drawn from a seeded generator, so the same
 * key always shows the same history and a reload does not reshuffle it.
 */


/* ── a seeded generator, so a record's history is stable ────────────────────────────────────── */

function hash(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export function rng(seed: string) {
	let a = hash(seed) || 1;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = <T>(r: () => number, list: ReadonlyArray<T>) => list[Math.floor(r() * list.length)]!;


const PATHS: Record<string, ReadonlyArray<readonly [ApiRequest["method"], string]>> = {
	orders: [
		["GET", "/v1/orders"],
		["GET", "/v1/orders/SO-12212"],
		["PATCH", "/v1/orders/SO-12198/fulfillment"],
		["POST", "/v1/orders/SO-12187/notes"],
	],
	customers: [
		["GET", "/v1/customers"],
		["GET", "/v1/customers/cust_1042"],
		["PATCH", "/v1/customers/cust_1007/tags"],
	],
	products: [
		["GET", "/v1/products"],
		["PATCH", "/v1/products/prod_2014/inventory"],
	],
	support: [
		["GET", "/v1/tickets"],
		["POST", "/v1/tickets"],
	],
	chargebacks: [["GET", "/v1/chargebacks"]],
	suppliers: [["GET", "/v1/suppliers/sup_allure/orders"]],
	analytics: [["GET", "/v1/reports/revenue?range=7d"]],
	data: [["GET", "/v1/exports/exp_31"]],
	automations: [["POST", "/v1/automations/flow_refund/runs"]],
	affiliates: [["GET", "/v1/affiliates/payouts"]],
};

/** The last requests a key made, newest first. A revoked or unused key has none after it stopped. */
export function requestsFor(k: ApiKey, scopes: ReadonlyArray<string>, n = 40): ApiRequest[] {
	if (!k.last_used_at) return [];
	const r = rng(k.id);
	const areas = [...new Set(scopes.map((s) => s.split(".")[0]!))].filter((a) => PATHS[a]);
	const pool = areas.length ? areas.flatMap((a) => PATHS[a]!) : PATHS.orders!;
	const ips = k.ips.length ? k.ips.map((ip) => ip.split("/")[0]!) : ["185.43.12.7", "34.91.206.18"];
	let t = Date.parse(k.last_used_at);
	return Array.from({ length: n }, (_, i) => {
		const [method, path] = pick(r, pool);
		const roll = r();
		const status = roll > 0.97 ? 429 : roll > 0.94 ? 404 : roll > 0.92 ? 401 : method === "POST" ? 201 : 200;
		const req: ApiRequest = { id: `${k.id}_r${i}`, method, path, status, ms: Math.round(40 + r() * (method === "GET" ? 180 : 420)), at: new Date(t).toISOString(), ip: pick(r, ips) };
		t -= Math.round((4 + r() * 50) * 60_000);
		return req;
	});
}

/** Requests per day for the last 14 days, oldest first. */
export function usageFor(k: ApiKey, at = Date.now()): Array<{ day: string; count: number; errors: number }> {
	const r = rng(`${k.id}:usage`);
	const base = k.last_used_at ? 120 + r() * 1400 : 0;
	const start = Date.parse(k.created_at);
	const stop = k.status === "revoked" && k.revoked_at ? Date.parse(k.revoked_at) : at;
	return Array.from({ length: 14 }, (_, i) => {
		const dayAt = at - (13 - i) * D;
		const live = dayAt >= start && dayAt <= stop + D && k.last_used_at !== undefined;
		const weekend = [0, 6].includes(new Date(dayAt).getDay());
		const count = live ? Math.round(base * (weekend ? 0.45 : 1) * (0.7 + r() * 0.6)) : 0;
		return { day: new Date(dayAt).toISOString(), count, errors: Math.round(count * r() * 0.03) };
	});
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

const SETTLED_KEYS: ApiKey[] = [
	{
		id: "key_live",
		label: "Magazijnsynchronisatie",
		prefix: "ins_live_8f2c",
		created_at: "2026-06-02T09:00:00Z",
		created_by: "mem_ethan",
		last_used_at: ago(14 * 60_000),
		status: "active",
		access: { kind: "custom", scopes: { orders: 2, products: 2, suppliers: 1 } },
		stores: ["store_us", "store_eu"],
		expires_at: ahead(9 * D),
		ips: ["185.43.12.0/24"],
	},
	{
		id: "key_zap",
		label: "Zapier",
		prefix: "ins_live_31ad",
		created_at: "2026-08-19T14:20:00Z",
		created_by: "mem_elena",
		last_used_at: ago(3 * H),
		status: "active",
		access: { kind: "role", roleId: "view" },
		stores: "all",
		expires_at: null,
		ips: [],
	},
	{
		id: "key_bi",
		label: "Looker Studio rapportage",
		prefix: "ins_live_c90e",
		created_at: "2026-09-04T11:00:00Z",
		created_by: "mem_sofia",
		last_used_at: ago(26 * H),
		status: "active",
		access: { kind: "role", roleId: "finance" },
		stores: "all",
		expires_at: ahead(220 * D),
		ips: [],
		rotated: { previousPrefix: "ins_live_77b1", until: ahead(18 * H) },
	},
	{
		id: "key_old",
		label: "Oude Shopify-app",
		prefix: "ins_live_04fa",
		created_at: "2025-11-10T10:00:00Z",
		created_by: "mem_elena",
		last_used_at: "2026-07-30T08:00:00Z",
		status: "revoked",
		revoked_at: "2026-08-02T09:00:00Z",
		access: { kind: "role", roleId: "admin" },
		stores: "all",
		expires_at: null,
		ips: [],
	},
];

function busyKeys(): ApiKey[] {
	const names = [
		"Voorraadfeed Allure Fulfillment",
		"Retourportaal ReturnLogic",
		"Klaviyo-segmenten nachtelijke sync",
		"Exact Online boekingen per dag",
		"Interne BI van het extern boekhoudkantoor Brinkman-Hoogendoorn",
		"Prijsmonitor concurrenten",
		"Testomgeving staging",
		"Make.com scenario's klantenservice",
	];
	const r = rng("busy-keys");
	return [
		...SETTLED_KEYS,
		...names.map((label, i): ApiKey => {
			const custom = i % 3 === 0;
			const access: KeyAccess = custom
				? { kind: "custom", scopes: Object.fromEntries(API_AREAS.filter(() => r() > 0.6).map((a) => [a.id, (r() > 0.5 ? 2 : 1) as ApiAccess])) }
				: { kind: "role", roleId: pick(r, ["view", "service", "finance", "admin"]) };
			const exp = [ahead((i + 2) * D), null, ago(3 * D), ahead(80 * D)][i % 4]!;
			return {
				id: `key_busy_${i}`,
				label,
				prefix: `ins_live_${(0x1a2b + i * 977).toString(16).slice(-4)}`,
				created_at: ago((30 + i * 11) * D),
				created_by: pick(r, ["mem_elena", "mem_ethan", "mem_sofia", "mem_liam"]),
				last_used_at: i === 6 ? undefined : ago(Math.round(r() * 60) * H + 5 * 60_000),
				status: i === 7 ? "revoked" : "active",
				revoked_at: i === 7 ? ago(4 * D) : undefined,
				access,
				stores: i % 2 ? ["store_eu"] : "all",
				expires_at: exp,
				ips: i % 4 === 1 ? ["34.91.206.18", "34.91.207.0/24"] : [],
			};
		}),
	];
}

export const seedKeys = (): ApiKey[] => byScenario({ empty: [], settled: SETTLED_KEYS, busy: busyKeys });

/* ── webhooks ────────────────────────────────────────────────────────────────────────────────── */

export type EventGroup = { area: AreaId | "inventory" | "refunds"; label: string; events: ReadonlyArray<{ id: string; label: string }> };

/** Every event Insyte can post, grouped the way the product is. */
export const EVENT_GROUPS: ReadonlyArray<EventGroup> = [
	{
		area: "orders",
		label: AREA_BY_ID.orders.label,
		events: [
			{ id: "order.created", label: "Bestelling geplaatst" },
			{ id: "order.paid", label: "Bestelling betaald" },
			{ id: "order.fulfilled", label: "Bestelling verzonden" },
			{ id: "order.delivered", label: "Bestelling bezorgd" },
			{ id: "order.refunded", label: "Bestelling terugbetaald" },
			{ id: "order.cancelled", label: "Bestelling geannuleerd" },
			{ id: "order.delayed", label: "Bestelling vertraagd" },
		],
	},
	{
		area: "refunds",
		label: "Terugbetalingen",
		events: [
			{ id: "refund.created", label: "Terugbetaling gemaakt" },
			{ id: "refund.failed", label: "Terugbetaling mislukt" },
		],
	},
	{
		area: "customers",
		label: AREA_BY_ID.customers.label,
		events: [
			{ id: "customer.created", label: "Klant aangemaakt" },
			{ id: "customer.updated", label: "Klant bijgewerkt" },
			{ id: "customer.merged", label: "Klanten samengevoegd" },
			{ id: "customer.blocked", label: "Klant geblokkeerd" },
		],
	},
	{
		area: "products",
		label: AREA_BY_ID.products.label,
		events: [
			{ id: "product.created", label: "Product aangemaakt" },
			{ id: "product.updated", label: "Product bijgewerkt" },
			{ id: "product.archived", label: "Product gearchiveerd" },
		],
	},
	{
		area: "inventory",
		label: "Voorraad",
		events: [
			{ id: "inventory.low", label: "Lage voorraad" },
			{ id: "inventory.out", label: "Uitverkocht" },
		],
	},
	{
		area: "support",
		label: AREA_BY_ID.support.label,
		events: [
			{ id: "ticket.created", label: "Ticket aangemaakt" },
			{ id: "ticket.replied", label: "Ticket beantwoord" },
			{ id: "ticket.assigned", label: "Ticket toegewezen" },
			{ id: "ticket.closed", label: "Ticket gesloten" },
		],
	},
	{
		area: "chargebacks",
		label: AREA_BY_ID.chargebacks.label,
		events: [
			{ id: "chargeback.opened", label: "Chargeback geopend" },
			{ id: "chargeback.evidence_due", label: "Bewijsdeadline nadert" },
			{ id: "chargeback.won", label: "Chargeback gewonnen" },
			{ id: "chargeback.lost", label: "Chargeback verloren" },
		],
	},
	{
		area: "suppliers",
		label: AREA_BY_ID.suppliers.label,
		events: [
			{ id: "supplier.delay_reported", label: "Vertraging gemeld" },
			{ id: "supplier.message", label: "Bericht van leverancier" },
			{ id: "supplier.order_accepted", label: "Bestelling geaccepteerd" },
		],
	},
	{
		area: "automations",
		label: AREA_BY_ID.automations.label,
		events: [
			{ id: "automation.run.completed", label: "Uitvoering geslaagd" },
			{ id: "automation.run.failed", label: "Uitvoering mislukt" },
			{ id: "automation.published", label: "Flow gepubliceerd" },
		],
	},
	{
		area: "affiliates",
		label: AREA_BY_ID.affiliates.label,
		events: [
			{ id: "affiliate.applied", label: "Aanmelding binnen" },
			{ id: "affiliate.approved", label: "Affiliate goedgekeurd" },
			{ id: "affiliate.payout.approved", label: "Uitbetaling goedgekeurd" },
		],
	},
];

export const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.id));
export const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENT_GROUPS.flatMap((g) => g.events.map((e) => [e.id, e.label])));

export const API_VERSIONS = ["2026-10-01", "2026-07-01", "2026-04-01"] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];

export const RETRY: ReadonlyArray<{ id: 0 | 3 | 5 | 8; label: string; detail: string }> = [
	{ id: 0, label: "Geen", detail: "Eén poging. Mislukt is mislukt." },
	{ id: 3, label: "3 pogingen", detail: "Na 1 min, 10 min en 1 uur." },
	{ id: 5, label: "5 pogingen", detail: "Tot 6 uur na de eerste poging." },
	{ id: 8, label: "8 pogingen", detail: "Tot 3 dagen na de eerste poging." },
];

/** Delays between attempts, in minutes, for the exponential schedule. */
const BACKOFF = [1, 10, 60, 180, 360, 720, 1440, 4320];

/** Consecutive failed deliveries after which Insyte stops sending to an endpoint. */
export const AUTO_DISABLE_AFTER = 5;

export type WebhookEndpoint = {
	id: string;
	url: string;
	description: string;
	events: string[];
	apiVersion: ApiVersion;
	stores: StoreScope;
	secret: string;
	secretRotatedAt?: string;
	headers: Array<{ key: string; value: string }>;
	retry: 0 | 3 | 5 | 8;
	/** Switched on by the operator. */
	active: boolean;
	/** Switched off by Insyte after too many failures in a row. */
	autoDisabled?: boolean;
	/** Failed deliveries in a row, counted from the newest. */
	failures: number;
	created_at: string;
	created_by: string;
};

export type Delivery = {
	id: string;
	endpointId: string;
	event: string;
	/** `null` is a timeout: nothing came back. */
	status: number | null;
	attempts: number;
	ms: number;
	at: string;
	nextRetry?: string;
	test?: boolean;
	request: Record<string, unknown>;
	response: string;
};

export const delivered = (d: Delivery) => d.status !== null && d.status >= 200 && d.status < 300;

export type Health = { rate: number | null; count: number; failed: number };

/** Share of deliveries in the last 24 hours that got a 2xx back. */
export function health(deliveries: ReadonlyArray<Delivery>, at = Date.now()): Health {
	const recent = deliveries.filter((d) => at - Date.parse(d.at) <= D);
	const ok = recent.filter(delivered).length;
	return { rate: recent.length ? (ok / recent.length) * 100 : null, count: recent.length, failed: recent.length - ok };
}

export type EndpointState = "active" | "failing" | "disabled" | "paused" | "new";

export function endpointState(w: WebhookEndpoint, deliveries: ReadonlyArray<Delivery>): EndpointState {
	if (w.autoDisabled) return "disabled";
	if (!w.active) return "paused";
	if (w.failures > 0) return "failing";
	return deliveries.length === 0 ? "new" : "active";
}

const SAMPLE_ORDER = { id: "ord_5012", number: "SO-12212", store: "store_eu", currency: "EUR", total: 129.95, customer: { id: "cust_1042", name: "Sanne de Vries", email: "sanne.devries@voorbeeldmail.nl" }, lines: [{ sku: "AUR-HF-M-BLK", title: "Aurora Hooded Fleece", quantity: 1, price: 89.95 }, { sku: "TRL-SK-2P", title: "Trail sokken, 2 paar", quantity: 2, price: 20 }] };

/** A payload that looks like what Insyte would send for this event. */
export function samplePayload(event: string, id: string, at: string, version: string): Record<string, unknown> {
	const [subject] = event.split(".");
	const data: Record<string, unknown> =
		subject === "order" || subject === "refund"
			? { ...SAMPLE_ORDER, status: event.split(".")[1], ...(subject === "refund" ? { refund: { amount: 20, reason: "Maat te klein", by: "mem_sofia" } } : {}) }
			: subject === "customer"
				? { id: "cust_1042", name: "Sanne de Vries", email: "sanne.devries@voorbeeldmail.nl", orders: 4, tags: ["vip"], merged_from: event === "customer.merged" ? ["cust_1188"] : undefined }
				: subject === "ticket"
					? { id: "tkt_4002", number: "TKT-0902", subject: "Waar blijft mijn bestelling?", priority: "high", assignee: "mem_sofia", order: "SO-12212" }
					: subject === "chargeback"
						? { id: "cb_2214", case: "DSP-2214", provider: "klarna", amount: 129.95, currency: "EUR", reason: "Niet ontvangen", evidence_due: new Date(Date.parse(at) + 2 * D).toISOString() }
						: subject === "supplier"
							? { supplier: "sup_allure", name: "Allure Fulfillment", order: "SO-12212", new_handover: new Date(Date.parse(at) + 3 * D).toISOString().slice(0, 10) }
							: subject === "product" || subject === "inventory"
								? { id: "prod_2014", title: "Aurora Hooded Fleece", sku: "AUR-HF-M-BLK", stock: subject === "inventory" ? 4 : 38, threshold: 10 }
								: subject === "automation"
									? { flow: "flow_refund", name: "Terugbetaling bij vertraging", run: "run_8812", status: event.endsWith("failed") ? "failed" : "completed", failed_step: event.endsWith("failed") ? "Terugbetalen via Stripe" : undefined }
									: { affiliate: "aff_031", name: "Noor Visser", amount: 412.5, currency: "EUR" };
	return { id, type: event, api_version: version, created_at: at, data: JSON.parse(JSON.stringify(data)) };
}

const RESPONSES: Record<number, string> = {
	200: '{"received":true}',
	201: '{"ok":true}',
	204: "",
	400: '{"error":"invalid_signature"}',
	404: "<html><body>Not Found</body></html>",
	500: '{"error":"internal","message":"database timeout"}',
	502: "<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>",
};

export const responseFor = (status: number | null) => (status === null ? "" : (RESPONSES[status] ?? '{"ok":true}'));

export function makeDelivery(endpoint: WebhookEndpoint, event: string, at: number, status: number | null, attempts: number, r: () => number, extra?: Partial<Delivery>): Delivery {
	const id = `evt_${hash(`${endpoint.id}${event}${at}${r()}`).toString(36)}`;
	const iso = new Date(at).toISOString();
	const ok = status !== null && status < 300;
	const retryLeft = !ok && attempts < endpoint.retry;
	return {
		id,
		endpointId: endpoint.id,
		event,
		status,
		attempts,
		ms: status === null ? 10_000 : Math.round(60 + r() * (ok ? 300 : 900)),
		at: iso,
		nextRetry: retryLeft ? new Date(at + BACKOFF[attempts - 1]! * 60_000).toISOString() : undefined,
		request: samplePayload(event, id, iso, endpoint.apiVersion),
		response: responseFor(status),
		...extra,
	};
}

/** The history of an endpoint, newest first: mostly 2xx, and the failing ones end in a run of errors. */
function deliveriesFor(w: WebhookEndpoint, n: number): Delivery[] {
	const r = rng(w.id);
	let t = Date.now() - Math.round(r() * 20 * 60_000);
	const out: Delivery[] = [];
	for (let i = 0; i < n; i++) {
		const failing = i < w.failures;
		const event = pick(r, w.events.length ? w.events : ALL_EVENTS);
		const status = failing ? pick(r, [502, 502, 500, null]) : r() > 0.985 ? 500 : pick(r, [200, 200, 200, 201, 204]);
		// The newest failure is still being retried; the ones before it have used every attempt.
		const attempts = failing ? (i === 0 ? 1 : Math.max(w.retry, 1)) : status === 500 ? 2 : 1;
		const made = makeDelivery(w, event, t, status, attempts, r);
		const d = failing && i === 0 && w.retry > 0 && !w.autoDisabled ? { ...made, nextRetry: new Date(Date.now() + 7 * 60_000).toISOString() } : { ...made, nextRetry: undefined };
		// A delivery that failed once and then went through says so: a second attempt and a 200.
		out.push(!failing && status === 500 ? { ...d, status: 200, response: responseFor(200), nextRetry: undefined } : d);
		t -= Math.round((3 + r() * 70) * 60_000);
	}
	return out;
}

const SECRET = (seed: string) => `whsec_${hash(seed).toString(16)}${hash(`${seed}x`).toString(16)}${hash(`${seed}y`).toString(16)}`.slice(0, 38);

const ep = (w: Omit<WebhookEndpoint, "secret" | "headers" | "apiVersion" | "stores" | "retry" | "active" | "failures"> & Partial<WebhookEndpoint>): WebhookEndpoint => ({
	secret: SECRET(w.id),
	headers: [],
	apiVersion: "2026-10-01",
	stores: "all",
	retry: 5,
	active: true,
	failures: 0,
	...w,
});

const SETTLED_HOOKS: WebhookEndpoint[] = [
	ep({
		id: "we_orders",
		url: "https://hooks.northwind.co/insyte/orders",
		description: "Magazijn: nieuwe en betaalde bestellingen naar de pakbon-printer.",
		events: ["order.created", "order.paid", "order.fulfilled", "order.refunded"],
		headers: [{ key: "X-Northwind-Env", value: "productie" }],
		created_at: "2026-06-02T09:30:00Z",
		created_by: "mem_ethan",
	}),
	ep({
		id: "we_disputes",
		url: "https://hooks.northwind.co/insyte/disputes",
		description: "Chargebacks naar het financiële kanaal in Slack.",
		events: ["chargeback.opened", "chargeback.evidence_due", "chargeback.won", "chargeback.lost"],
		failures: 3,
		retry: 3,
		created_at: "2026-07-14T13:00:00Z",
		created_by: "mem_elena",
	}),
	ep({
		id: "we_klaviyo",
		url: "https://a.klaviyo.com/api/webhooks/insyte/northwind",
		description: "Klantsegmenten bijwerken na samenvoegen en nieuwe bestellingen.",
		events: ["customer.created", "customer.updated", "customer.merged", "order.created"],
		stores: ["store_eu"],
		apiVersion: "2026-07-01",
		created_at: "2026-09-01T08:00:00Z",
		created_by: "mem_maya",
	}),
];

function busyHooks(): WebhookEndpoint[] {
	const extra: Array<[string, string, string[], Partial<WebhookEndpoint>]> = [
		["https://api.returnlogic.com/v2/hooks/insyte-northwind-clothing-co", "Retouren aanmelden zodra een bestelling terugbetaald is.", ["order.refunded", "refund.created", "refund.failed"], {}],
		["https://n8n.northwind.co/webhook/9f0d-voorraad", "Voorraadmeldingen naar inkoop.", ["inventory.low", "inventory.out", "product.updated"], { failures: AUTO_DISABLE_AFTER, autoDisabled: true }],
		["https://hooks.zapier.com/hooks/catch/1840213/b7xq2m/", "Tickets naar het teambord.", ["ticket.created", "ticket.assigned", "ticket.closed"], { failures: 1 }],
		["https://exact-koppeling.brinkman-hoogendoorn-administratie.nl/insyte/inbound", "Boekhouding: betaalde bestellingen en terugbetalingen per dag.", ["order.paid", "refund.created"], { apiVersion: "2026-04-01" }],
		["https://staging.northwind.co/insyte/all", "Staging: alles, om nieuwe versies te testen.", ALL_EVENTS, { active: false }],
	];
	return [
		...SETTLED_HOOKS,
		...extra.map(([url, description, events, rest], i) =>
			ep({ id: `we_busy_${i}`, url, description, events, created_at: ago((20 + i * 9) * D), created_by: i % 2 ? "mem_sofia" : "mem_ethan", ...rest }),
		),
	];
}

export const seedWebhooks = (): WebhookEndpoint[] => byScenario({ empty: [], settled: SETTLED_HOOKS, busy: busyHooks });

export const seedDeliveries = (hooks: ReadonlyArray<WebhookEndpoint>): Delivery[] =>
	hooks.flatMap((w) => (w.id === "we_busy_4" ? [] : deliveriesFor(w, byScenario({ empty: 0, settled: 36, busy: () => 70 }))));

/** A person's name for a member id the seeds use, when the member is not in this design state. */
export const fallbackName = (id: string) => ({ mem_elena: "Elena Hart", mem_ethan: "Ethan Jeppesen", mem_sofia: "Sofía Kim", mem_maya: "Maya Roy", mem_liam: "Liam Tucker" })[id] ?? longName(3);

export const newSecret = () => `whsec_${randomHex(16)}`;

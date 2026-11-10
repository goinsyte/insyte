import type { Currency } from "./types/domain.ts";

/*
 * Returns and claims (PLAN 25, design §1). A RETURN is the shopper sending something back; a CLAIM
 * is the shopper reporting a problem with what arrived — damaged, wrong, poor quality — where
 * nothing may need to come back. Both live in one queue because they are worked the same way.
 *
 * Pure: the words, the windows, the rules and the transitions, tested on their own. The store keeps
 * the records; the screens and the public portal read these functions, so they cannot disagree on
 * whether something is returnable or on what a return may do next.
 */

export type ReturnKind = "return" | "claim";

export type ReturnStatus = "review" | "awaiting_parcel" | "in_transit" | "received" | "ready" | "resolved" | "rejected";

export const STATUS_LABEL: Record<ReturnStatus, string> = {
	review: "Te beoordelen",
	awaiting_parcel: "Wacht op pakket",
	in_transit: "Onderweg",
	received: "Ontvangen",
	ready: "Klaar om af te handelen",
	resolved: "Afgehandeld",
	rejected: "Afgewezen",
};

export const STATUS_TONE: Record<ReturnStatus, "warning" | "info" | "neutral" | "success" | "muted" | "danger"> = {
	review: "warning",
	awaiting_parcel: "info",
	in_transit: "info",
	received: "neutral",
	ready: "warning",
	resolved: "success",
	rejected: "muted",
};

export type Resolution = "refund" | "exchange" | "gift_card" | "replacement" | "discount";

export const RESOLUTION_LABEL: Record<Resolution, string> = {
	refund: "Terugbetalen",
	exchange: "Ruilen",
	gift_card: "Cadeaubon",
	replacement: "Nieuw artikel",
	discount: "Kortingscode",
};

/** What a resolution says to the shopper, as the clause after "De klant krijgt". */
export const RESOLUTION_DETAIL: Record<Resolution, string> = {
	refund: "het geld terug op de oorspronkelijke betaalmethode",
	exchange: "een andere maat of kleur, zonder extra kosten",
	gift_card: "een cadeaubon voor het bedrag plus de bonus",
	replacement: "een nieuw exemplaar, zonder iets terug te sturen",
	discount: "een kortingscode voor een volgende bestelling",
};

/** The default reasons' ids; a workspace may add its own. */
export type ReasonId = "too_small" | "too_big" | "not_as_expected" | "damaged" | "wrong_item" | "quality" | (string & {});

export type ReasonDef = {
	id: ReasonId;
	label: string;
	/** A claim reason: the shopper reports a problem, so a photo usually comes with it. */
	claim: boolean;
	photoRequired: boolean;
	/** Counts toward the product's complaint rate (§3). */
	quality: boolean;
	/** Its own window in days, where it differs from the return or claim window. */
	windowDays?: number;
};

export const DEFAULT_REASONS: ReadonlyArray<ReasonDef> = [
	{ id: "too_small", label: "Te klein", claim: false, photoRequired: false, quality: false },
	{ id: "too_big", label: "Te groot", claim: false, photoRequired: false, quality: false },
	{ id: "not_as_expected", label: "Anders dan verwacht", claim: false, photoRequired: false, quality: false },
	{ id: "damaged", label: "Beschadigd aangekomen", claim: true, photoRequired: true, quality: true, windowDays: 14 },
	{ id: "wrong_item", label: "Verkeerd artikel", claim: true, photoRequired: true, quality: false, windowDays: 14 },
	{ id: "quality", label: "Kwaliteit", claim: true, photoRequired: true, quality: true },
];

/* ── product rules ─────────────────────────────────────────────────────────────────────────── */

export type RuleKind = "not_returnable" | "refund_only" | "exchange_only";

export const RULE_LABEL: Record<RuleKind, string> = {
	not_returnable: "Niet retourneerbaar",
	refund_only: "Alleen terugbetalen",
	exchange_only: "Alleen ruilen",
};

export type ProductRule = {
	id: string;
	kind: RuleKind;
	/** What it applies to: a product, a variant, or every product with a Shopify tag. */
	target: { by: "product"; productId: string; label: string } | { by: "variant"; variantId: string; label: string } | { by: "tag"; tag: string };
	/** Why, in the shopper's words: the portal shows it. */
	note: string;
};

export function ruleFor(rules: ReadonlyArray<ProductRule>, item: { productId: string; variantId?: string; tags?: ReadonlyArray<string> }): ProductRule | undefined {
	return (
		rules.find((r) => r.target.by === "variant" && r.target.variantId === item.variantId) ??
		rules.find((r) => r.target.by === "product" && r.target.productId === item.productId) ??
		rules.find((r) => r.target.by === "tag" && (item.tags ?? []).includes(r.target.tag))
	);
}

/** The resolutions a shopper may pick for an item, after its rule and what the store offers. */
export function resolutionsFor(offered: ReadonlyArray<Resolution>, rule: ProductRule | undefined, kind: ReturnKind): Resolution[] {
	if (rule?.kind === "not_returnable" && kind === "return") return [];
	const base = offered.filter((r) => (kind === "return" ? r !== "replacement" : true));
	if (rule?.kind === "refund_only") return base.filter((r) => r === "refund");
	if (rule?.kind === "exchange_only") return base.filter((r) => r === "exchange" || (kind === "claim" && r === "replacement"));
	return base;
}

/* ── windows ───────────────────────────────────────────────────────────────────────────────── */

export const DAY = 86_400_000;

export type WindowCheck = { inside: boolean; daysSince: number; closesOn: Date; days: number };

/** Whether `now` is inside a window of `days` that opened at delivery. */
export function windowCheck(deliveredAt: string | number, days: number, now: number): WindowCheck {
	const from = typeof deliveredAt === "number" ? deliveredAt : Date.parse(deliveredAt);
	const daysSince = Math.floor((now - from) / DAY);
	const closesOn = new Date(from + days * DAY);
	return { inside: now <= closesOn.getTime(), daysSince, closesOn, days };
}

/** The window that applies: the reason's own, else the claim or return window. */
export function windowDaysFor(kind: ReturnKind, reason: ReasonDef | undefined, windows: { returnDays: number; claimDays: number }): number {
	return reason?.windowDays ?? (kind === "claim" ? windows.claimDays : windows.returnDays);
}

/** How long the team has to look at a new request: two working days, said as 48 hours. */
export const REVIEW_HOURS = 48;

export const reviewDeadline = (createdAt: string) => new Date(Date.parse(createdAt) + REVIEW_HOURS * 3_600_000).toISOString();

export const pastDeadline = (status: ReturnStatus, deadline: string, now: number) => status === "review" && Date.parse(deadline) < now;

/* ── transitions ───────────────────────────────────────────────────────────────────────────── */

export class IllegalReturnMove extends Error {
	constructor(from: ReturnStatus, move: string) {
		super(`Cannot ${move} a return that is ${from}`);
	}
}

/**
 * What a status may move to. A claim approved with "Nieuw artikel zonder terugsturen" goes straight
 * to Klaar om af te handelen; everything else waits for its parcel.
 */
export const NEXT: Record<ReturnStatus, ReadonlyArray<ReturnStatus>> = {
	review: ["awaiting_parcel", "ready", "rejected"],
	awaiting_parcel: ["in_transit", "received", "rejected"],
	in_transit: ["received"],
	received: ["ready"],
	ready: ["resolved"],
	resolved: [],
	rejected: ["review"],
};

export function move(from: ReturnStatus, to: ReturnStatus): ReturnStatus {
	if (!NEXT[from].includes(to)) throw new IllegalReturnMove(from, `move to ${to}`);
	return to;
}

/** Approving: a claim that keeps nothing goes straight to be resolved; anything else waits for its parcel. */
export const approvedStatus = (kind: ReturnKind, keepItem: boolean): ReturnStatus => (kind === "claim" && keepItem ? "ready" : "awaiting_parcel");

/* ── money and rates ───────────────────────────────────────────────────────────────────────── */

/** A gift card is the amount plus the store's bonus; an exchange may cost a fee. */
export function resolutionAmount(kind: Resolution, amount: number, settings: { giftCardBonus: number; exchangeFee: number }): number {
	if (kind === "gift_card") return Math.round(amount * (1 + settings.giftCardBonus / 100) * 100) / 100;
	if (kind === "exchange") return settings.exchangeFee;
	if (kind === "discount") return Math.round(amount * 0.15 * 100) / 100;
	return amount;
}

/** The share of units sold that came back, as a fraction. Nothing sold reads as zero, not as a hole. */
export function returnRate(returnedUnits: number, soldUnits: number): number {
	return soldUnits <= 0 ? 0 : returnedUnits / soldUnits;
}

export const pct = (x: number) => `${(x * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;

/** "R-1042". */
export const returnNumber = (n: number) => `R-${n}`;

/* ── the record and the settings, as a host supplies them ──────────────────────────────────── */

export type Carrier = "PostNL" | "DHL" | "DPD" | "UPS";

export type ReturnItem = { lineId: string; productId: string; variantId?: string; title: string; variantTitle: string; qty: number; unitPrice: number };

export type ReturnEvent = { at: string; who: "shopper" | "team" | "carrier" | "insyte" | "hub"; name?: string; text: string };

export type ReturnRecord = {
	id: string;
	number: string;
	kind: ReturnKind;
	orderId: string;
	orderNumber: string;
	customerId: string;
	customerName: string;
	customerEmail: string;
	storeId: string;
	country: string;
	/** The order's currency: what was paid is what comes back. */
	currency: Currency;
	items: ReturnItem[];
	/** What it is worth and how many units, where the host has them without the lines (a list row). */
	amount?: number | undefined;
	units?: number | undefined;
	reason: ReasonId;
	/** The shopper's own words. */
	note: string;
	/** Photos the shopper added (a claim needs them). */
	photos: string[];
	/** What the shopper chose, and for an exchange what to. */
	requested: Resolution;
	exchangeTo?: string | undefined;
	status: ReturnStatus;
	createdAt: string;
	deadline: string;
	/** When the order was delivered: the window counts from here. */
	deliveredAt: string;
	label?: { carrier: Carrier; tracking: string; sentAt: string } | undefined;
	/** A label asked for and on its way from the carrier, or the carrier's reason for not making one. */
	labelPending?: boolean | undefined;
	labelFailed?: string | undefined;
	assignee?: string | undefined;
	/** Counts toward the product's complaint rate (§3). */
	quality: boolean;
	tags: string[];
	resolution?: { kind: Resolution; amount: number; at: string; by: string; replacementOrder?: string | undefined } | undefined;
	rejectReason?: string | undefined;
	events: ReturnEvent[];
};

export type ReturnAddress = {
	country: string;
	label: string;
	address: string;
	carrier: Carrier;
	name?: string | undefined;
	line1?: string | undefined;
	postcode?: string | undefined;
	city?: string | undefined;
};

export type ReturnSettings = {
	returnDays: number;
	claimDays: number;
	specialWindows: Array<{ id: string; label: string; days: number; from: string; to: string }>;
	reasons: ReasonDef[];
	rules: ProductRule[];
	offered: Resolution[];
	giftCardBonus: number;
	exchangeFee: number;
	/**
	 * Where parcels from a country go. `address` is the line the screens show; the parts are what a carrier's label needs
	 * (absent on an address saved before labels, which then cannot get one).
	 */
	addresses: Array<ReturnAddress>;
	claimSteps: string[];
	portal: { on: boolean; handle: string; intro: string; done: string };
};

export const amountOf = (r: Pick<ReturnRecord, "items" | "amount">) => r.amount ?? r.items.reduce((n, i) => n + i.qty * i.unitPrice, 0);

export const unitsOf = (r: Pick<ReturnRecord, "items" | "units">) => r.units ?? r.items.reduce((n, i) => n + i.qty, 0);

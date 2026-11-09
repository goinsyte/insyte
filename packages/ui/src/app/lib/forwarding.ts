/*
 * The dropship step (PLAN 24, design §2): a paid order's lines go to their supplier, the supplier
 * confirms, or it goes wrong. One LEG per order × supplier, because an order with lines from two
 * suppliers is two hand-offs that move on their own.
 *
 * Pure: the transitions and the waiting maths, tested on their own. The store holds the legs and
 * lays the supplier's own work (`supplierWork`) over them: a supplier that accepted has confirmed,
 * whatever the leg said; a supplier that reported a problem has put it in error.
 */

export type LegState = "to_forward" | "sending" | "awaiting" | "confirmed" | "error" | "cancelled";

export type ErrorReason = "stock" | "address" | "no_supplier" | "rejected" | "send_failed" | "supplier_paused";

/** The founder added `send_failed` and `supplier_paused` (2026-11-09); the suggested next step for both is another supplier or a retry. */
export const REASON_LABEL: Record<ErrorReason, string> = {
	stock: "Leverancier meldt uitverkocht",
	address: "Adres onvolledig",
	no_supplier: "Geen leverancier gekoppeld",
	rejected: "Leverancier weigert de bestelling",
	send_failed: "Versturen naar de leverancier mislukt",
	supplier_paused: "Leverancier gepauzeerd",
};

export type ForwardVia = "portal" | "email" | "api";

export const VIA_LABEL: Record<ForwardVia, string> = { portal: "Leveranciersportaal", email: "E-mail", api: "API" };

export type Leg = {
	orderId: string;
	supplierId: string;
	state: LegState;
	/** When it entered this state: paid, sent, failed. */
	since: string;
	via?: ForwardVia | undefined;
	reason?: ErrorReason | undefined;
	/** Who moved it last: a person's name, "Insyte", or the supplier's name. */
	by?: string | undefined;
	/** While a send waits out the undo window, until when. */
	sendingUntil?: number | undefined;
	/** The supplier it was taken from when it was sent elsewhere. */
	from?: string | undefined;
	/** The supplier's own words about an error, or the operator's note with the order. */
	note?: string | undefined;
};

export type ForwardPrefs = Record<string, { via: ForwardVia; auto: boolean }>;

export type ForwardView = "to_forward" | "awaiting" | "forward_error";

export const FORWARD_VIEWS: ReadonlyArray<ForwardView> = ["to_forward", "awaiting", "forward_error"];
export const isForwardView = (v: unknown): v is ForwardView => typeof v === "string" && (FORWARD_VIEWS as ReadonlyArray<string>).includes(v);

export const VIEW_LABEL: Record<ForwardView, string> = {
	to_forward: "Te versturen",
	awaiting: "Wacht op bevestiging",
	forward_error: "Uitverkocht of fout",
};

export const legKey = (orderId: string, supplierId: string) => `${orderId}|${supplierId}`;

/** What the supplier's own work says about a leg, which wins over what the leg was told. */
export type SupplierSignal = { accepted?: boolean; shipped?: boolean; problem?: "stock" | "address" | "delay" | "damaged" | "other" };

export function effective(leg: Leg, signal: SupplierSignal | undefined, now: number): LegState {
	if (leg.state === "cancelled") return "cancelled";
	if (signal?.problem === "stock" || signal?.problem === "address") return "error";
	if (signal?.accepted || signal?.shipped) return "confirmed";
	if (leg.state === "sending" && (leg.sendingUntil ?? 0) <= now) return "awaiting";
	return leg.state;
}

export function reasonOf(leg: Leg, signal: SupplierSignal | undefined): ErrorReason | undefined {
	if (signal?.problem === "stock") return "stock";
	if (signal?.problem === "address") return "address";
	return leg.reason;
}

export function inView(state: LegState, view: ForwardView): boolean {
	if (view === "to_forward") return state === "to_forward";
	if (view === "awaiting") return state === "awaiting" || state === "sending";
	return state === "error";
}

/* ── transitions ───────────────────────────────────────────────────────────────────────────── */

export class IllegalMove extends Error {
	constructor(from: LegState, move: string) {
		super(`Cannot ${move} a leg that is ${from}`);
	}
}

/** Sends a leg to its supplier. It waits out the undo window as "sending", then awaits confirmation. */
export function forward(leg: Leg, at: number, opts: { via: ForwardVia; by: string; window: number }): Leg {
	if (leg.state !== "to_forward" && leg.state !== "error") throw new IllegalMove(leg.state, "forward");
	return { ...leg, state: "sending", since: new Date(at).toISOString(), via: opts.via, by: opts.by, sendingUntil: at + opts.window, reason: undefined };
}

export function confirm(leg: Leg, at: number, by: string): Leg {
	if (leg.state !== "awaiting" && leg.state !== "sending") throw new IllegalMove(leg.state, "confirm");
	return { ...leg, state: "confirmed", since: new Date(at).toISOString(), by, sendingUntil: undefined };
}

export function fail(leg: Leg, at: number, reason: ErrorReason, by: string): Leg {
	if (leg.state === "confirmed" || leg.state === "cancelled") throw new IllegalMove(leg.state, "fail");
	return { ...leg, state: "error", since: new Date(at).toISOString(), reason, by, sendingUntil: undefined };
}

/** Takes a failed leg to another supplier: it is to be forwarded again, there. */
export function reroute(leg: Leg, at: number, supplierId: string, by: string): Leg {
	if (leg.state !== "error" && leg.state !== "to_forward") throw new IllegalMove(leg.state, "reroute");
	return { ...leg, supplierId, from: leg.supplierId, state: "to_forward", since: new Date(at).toISOString(), reason: undefined, by };
}

export function cancel(leg: Leg, at: number, by: string): Leg {
	if (leg.state === "confirmed") throw new IllegalMove(leg.state, "cancel");
	return { ...leg, state: "cancelled", since: new Date(at).toISOString(), by };
}

/* ── waiting ───────────────────────────────────────────────────────────────────────────────── */

export const HOUR = 3_600_000;

/** Whole hours a leg has waited in its state. */
export const waitedHours = (since: string, now: number) => Math.max(0, Math.floor((now - Date.parse(since)) / HOUR));

/** A supplier that has not confirmed within 24 hours is late, and the queue and Start say so. */
export const overdue = (state: LegState, since: string, now: number) => (state === "awaiting" || state === "sending") && now - Date.parse(since) > 24 * HOUR;

/** "3 u", "1 d 7 u", "zojuist". */
export function waitedLabel(since: string, now: number): string {
	const h = waitedHours(since, now);
	if (h === 0) return "zojuist";
	if (h < 24) return `${h} u`;
	const d = Math.floor(h / 24);
	const r = h % 24;
	return r === 0 ? `${d} d` : `${d} d ${r} u`;
}

/** "12 bestellingen naar 3 leveranciers doorsturen". */
export function forwardSentence(legs: ReadonlyArray<Pick<Leg, "orderId" | "supplierId">>): string {
	const orders = new Set(legs.map((l) => l.orderId)).size;
	const suppliers = new Set(legs.map((l) => l.supplierId)).size;
	return `${orders} ${orders === 1 ? "bestelling" : "bestellingen"} naar ${suppliers} ${suppliers === 1 ? "leverancier" : "leveranciers"} doorsturen`;
}


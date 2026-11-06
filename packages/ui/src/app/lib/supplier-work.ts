import type { Order, OrderLineItem, Product } from "./types/domain";

/**
 * The supplier's side of an order. A supplier sees only its own lines — its items, what the brand
 * pays it for them, where they go — never the other suppliers' lines, the order total or the
 * customer's email and phone. Its work on an order lives in the workspace so the brand sees every
 * step: accepted, the parcels with their tracking, or a problem reported.
 */

export type ProblemKind = "stock" | "delay" | "address" | "damaged" | "other";

export const PROBLEM_LABEL: Record<ProblemKind, string> = {
	stock: "Niet op voorraad",
	delay: "Later klaar dan beloofd",
	address: "Adres klopt niet",
	damaged: "Beschadigd bij inpakken",
	other: "Iets anders",
};

export type Parcel = { id: string; carrier: string; tracking: string; at: string; lines: string[] };

export type SupplierWork = {
	accepted_at?: string;
	parcels: Parcel[];
	problem?: { kind: ProblemKind; note: string; newDate?: string; at: string; ticketId?: string };
};

export type SupplierStatus = "to_accept" | "to_ship" | "problem" | "shipped" | "closed";

export const STATUS_LABEL: Record<SupplierStatus, string> = {
	to_accept: "Te accepteren",
	to_ship: "Te verzenden",
	problem: "Probleem gemeld",
	shipped: "Verzonden",
	closed: "Afgesloten",
};

export const CARRIERS = ["PostNL", "DHL", "DPD", "UPS", "GLS", "FedEx"] as const;

/** The supplier the demo signs in as: Marco Rossi at Allure Fulfillment. */
export const ME_SUPPLIER = { id: "sup_allure", name: "Allure Fulfillment" } as const;

export const workKey = (orderId: string, supplierId: string) => `${orderId}|${supplierId}`;

export const linesOf = (o: Order, supplierId: string): OrderLineItem[] => o.line_items.filter((li) => li.supplier_id === supplierId);

export function statusOf(o: Order, w: SupplierWork | undefined): SupplierStatus {
	if (o.status === "cancelled" || o.status === "refunded") return "closed";
	if (w?.problem) return "problem";
	if ((w?.parcels.length ?? 0) > 0 || o.status === "shipped" || o.status === "delivered") return "shipped";
	if (w?.accepted_at || o.status === "at_supplier") return "to_ship";
	return "to_accept";
}

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const DAY = 86_400_000;
const startOfToday = () => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

/**
 * When the brand expects the parcel handed to the carrier. Open orders get a hand-off date spread
 * from yesterday to four days out, the way a real week of orders lands; a problem with a new date
 * moves it.
 */
export function handoffBy(o: Order, w: SupplierWork | undefined): Date {
	if (w?.problem?.newDate) return new Date(w.problem.newDate);
	return new Date(startOfToday() + ((hash(o.id) % 6) - 1) * DAY + 17 * 3_600_000);
}

export type Due = "late" | "today" | "soon" | "later";

export function dueOf(o: Order, w: SupplierWork | undefined): Due {
	const d = handoffBy(o, w).getTime();
	const t = startOfToday();
	if (d < t) return "late";
	if (d < t + DAY) return "today";
	if (d < t + 3 * DAY) return "soon";
	return "later";
}

/** What the brand pays the supplier for its lines: the product's cost, not the shelf price. */
export function supplierAmount(lines: ReadonlyArray<OrderLineItem>, products: ReadonlyArray<Product>): number {
	return lines.reduce((n, li) => {
		const p = products.find((x) => x.id === li.product_id);
		return n + (p?.cost ?? li.unit_price * 0.4) * li.quantity;
	}, 0);
}

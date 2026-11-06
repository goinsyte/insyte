import type { Order, Product, Supplier } from "./types/domain";

/*
 * What the catalogue knows about itself, computed from the records rather than written beside them:
 * a product's category (from what it is called), its stock (from its variants), how fast it sells
 * (from the orders that carry it), and how each supplier is doing (from those same orders). Every
 * screen that shows one of these reads it from here, so the list, the product, the advice and the
 * supplier scorecard cannot disagree.
 */

export type Stock = "available" | "low" | "out";

const CATEGORY: ReadonlyArray<[RegExp, string]> = [
	[/jacket|fleece|bomber|raincoat|puffer|jas\b|jack\b/i, "Jassen"],
	[/beanie|crewneck|henley|flannel|shirt|\btee\b|muts|sweater|overhemd|trui/i, "Tops en breigoed"],
	[/pant|shorts|joggers|broek/i, "Broeken"],
	[/sandal|sneaker|boot|sandaal|schoen/i, "Schoenen"],
	[/tote|belt|daypack|cap|wallet|bag|tas\b|riem|rugzak|\bpet\b|portemonnee/i, "Accessoires"],
];

export const categoryOf = (title: string): string => CATEGORY.find(([re]) => re.test(title))?.[1] ?? "Overig";

export const CATEGORIES = [...new Set(CATEGORY.map(([, c]) => c)), "Overig"];

/** Units across every variant. */
export const unitsOf = (p: Product): number => p.variants.reduce((n, v) => n + Math.max(0, v.inventory_level), 0);

/** Out when nothing is left; low when a variant is out or fewer than 60 units remain. */
export function stockOf(p: Product): Stock {
	const units = unitsOf(p);
	if (units === 0) return "out";
	if (units < 60 || p.variants.some((v) => v.inventory_level <= 0)) return "low";
	return "available";
}

export const marginOf = (price: number, cost: number | undefined): number =>
	cost === undefined || price <= 0 ? 0 : (price - cost) / price;

const DAY = 86_400_000;

/**
 * Units sold per day over the last 30 days the workspace has orders for, and how many days the stock
 * on hand lasts at that pace. Null when it has not sold in that window.
 */
export function sellThrough(p: Product, orders: ReadonlyArray<Order>): { perDay: number; daysLeft: number | null } {
	const end = orders.length === 0 ? Date.now() : Math.max(...orders.map((o) => Date.parse(o.created_at))) + DAY;
	const sold = orders
		.filter((o) => Date.parse(o.created_at) >= end - 30 * DAY && o.status !== "cancelled" && o.status !== "refunded")
		.flatMap((o) => o.line_items)
		.filter((li) => li.product_id === p.id)
		.reduce((n, li) => n + li.quantity, 0);
	const perDay = sold / 30;
	return { perDay, daysLeft: perDay === 0 ? null : unitsOf(p) / perDay };
}

export type SupplierStats = {
	supplier: Supplier;
	products: number;
	open: number;
	delayed: number;
	shipped: number;
	/** Shipped or delivered without a delay flag, of everything they have shipped or are late on. */
	onTime: number | null;
};

export function supplierStats(
	suppliers: ReadonlyArray<Supplier>,
	products: ReadonlyArray<Product>,
	orders: ReadonlyArray<Order>,
): SupplierStats[] {
	return suppliers.map((s) => {
		const theirs = orders.filter((o) => o.line_items.some((li) => li.supplier_id === s.id));
		const closed = (o: Order) => o.status === "cancelled" || o.status === "refunded";
		const delayed = theirs.filter((o) => o.tags.includes("at_risk") && !closed(o)).length;
		const shipped = theirs.filter((o) => (o.status === "shipped" || o.status === "delivered") && !o.tags.includes("at_risk")).length;
		const open = theirs.filter((o) => !closed(o) && o.status !== "delivered").length;
		return {
			supplier: s,
			products: products.filter((p) => p.supplier_id === s.id).length,
			open,
			delayed,
			shipped,
			onTime: shipped + delayed === 0 ? null : shipped / (shipped + delayed),
		};
	});
}

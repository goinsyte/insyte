/*
 * Which supplier fulfils an order. The fixtures carry no supplier on an order, so it is derived from
 * the order id — the same answer on the Orders list, its Supplier facet and the home board's supplier
 * delays widget, which is the point of keeping it in one place.
 */
export const SUPPLIERS = [
	"Skyway Freight",
	"Oceanic Logistics",
	"City Couriers",
	"Delta Transport",
	"Express Carriers",
	"LogiTech Services",
	"Linyi Logistics",
	"Rapid Logistics",
] as const;

export function supplierName(orderId: string) {
	const i = Number.parseInt(orderId.slice(-2), 10) || 0;
	return SUPPLIERS[i % SUPPLIERS.length] ?? SUPPLIERS[0];
}

import { customers } from "./customers";
import { products } from "./products";
import { byScenario } from "../scenario";
import type { Order, OrderStatus } from "@insyte/ui/app/lib/types/domain";

const STATUSES: OrderStatus[] = [
	"placed",
	"paid",
	"at_supplier",
	"shipped",
	"delivered",
	"refunded",
];

const CARRIERS = ["DHL", "UPS", "FedEx", "USPS", "DPD"];

function pseudoPick<T>(arr: T[], seed: number) {
	return arr[seed % arr.length];
}

export const orders: Order[] = Array.from({ length: byScenario({ empty: 0, settled: 60, busy: () => 320 }) }).map((_, i) => {
	const customer = pseudoPick(customers, i * 3 + 1);
	const status = pseudoPick(STATUSES, i + 2);
	const lineCount = (i % 3) + 1;
	const line_items = Array.from({ length: lineCount }).map((__, li) => {
		const product = pseudoPick(products, i * 5 + li * 7 + 3);
		const variant = pseudoPick(product.variants, li);
		const quantity = ((i + li) % 3) + 1;
		return {
			id: `oli_${i}_${li}`,
			product_id: product.id,
			variant_id: variant.id,
			title: product.title,
			variant_title: variant.title,
			quantity,
			unit_price: variant.price,
			supplier_id: product.supplier_id,
		};
	});
	const total = line_items.reduce(
		(sum, li) => sum + li.unit_price * li.quantity,
		0,
	);
	const month = String((i % 5) + 1).padStart(2, "0");
	const day = String(((i * 7) % 27) + 1).padStart(2, "0");

	return {
		id: `ord_${5000 + i}`,
		number: `SO-${12200 + i}`,
		store_id: i % 4 === 0 ? "store_eu" : "store_us",
		shopify_id: `gid://shopify/Order/${9000000 + i}`,
		customer_id: customer.id,
		customer_name: customer.name,
		customer_email: customer.email,
		status,
		payment_status: status === "refunded" ? "refunded" : "paid",
		fulfillment_status:
			status === "placed" || status === "paid"
				? "unfulfilled"
				: status === "at_supplier"
					? "partial"
					: status === "delivered" || status === "shipped"
						? "fulfilled"
						: "unfulfilled",
		total,
		currency: "USD",
		line_items,
		shipping_address: customer.address,
		tracking_number:
			status === "shipped" || status === "delivered"
				? `1Z${1000000000 + i * 17}`
				: undefined,
		carrier:
			status === "shipped" || status === "delivered"
				? pseudoPick(CARRIERS, i)
				: undefined,
		estimated_delivery:
			status === "shipped"
				? `2026-06-${String(((i * 3) % 27) + 1).padStart(2, "0")}T00:00:00Z`
				: undefined,
		// Insyte's own delay marker, plus a few tags an operator would have added by hand.
		tags: [
			...(i % 8 === 0 ? ["at_risk"] : []),
			...(i % 6 === 1 ? ["cadeau"] : []),
			...(i % 9 === 4 ? ["wholesale"] : []),
			...(i % 11 === 3 ? ["vip"] : []),
		],
		notes: i % 11 === 0 ? "Cadeauverpakking gevraagd bij het afrekenen." : undefined,
		created_at: `2026-${month}-${day}T${String(i % 23).padStart(2, "0")}:${String((i * 3) % 60).padStart(2, "0")}:00Z`,
		updated_at: `2026-05-${String((i % 22) + 1).padStart(2, "0")}T15:00:00Z`,
	};
});

export function ordersBySupplier(supplierId: string) {
	return orders.filter((o) =>
		o.line_items.some((li) => li.supplier_id === supplierId),
	);
}

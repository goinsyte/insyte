import { createFileRoute, notFound } from "@tanstack/react-router";
import { orders } from "@insyte/ui/data-source";
import { ME_SUPPLIER } from "@insyte/ui/app/lib/supplier-work";
import { SupplierOrder } from "@insyte/ui/app/supplier/order-screen";

export const Route = createFileRoute("/_supplier/supplier/orders/$orderId")({
	loader: ({ params }) => {
		// A supplier opens only orders that hold its own lines; any other id is not theirs to see.
		const o = orders.find((x) => x.id === params.orderId);
		if (!o || !o.line_items.some((l) => l.supplier_id === ME_SUPPLIER.id)) throw notFound();
		return { id: o.id };
	},
	component: SupplierOrder,
});

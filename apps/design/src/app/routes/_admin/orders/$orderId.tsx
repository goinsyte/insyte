import { createFileRoute, notFound } from "@tanstack/react-router";
import { customers } from "@insyte/ui/data-source";
import { orders } from "@insyte/ui/data-source";
import { OrderDetailPage } from "@insyte/ui/app/orders/order-screen";

export const Route = createFileRoute("/_admin/orders/$orderId")({
	loader: ({ params }) => {
		// The fixture answers "does this order exist" for a cold URL; the order is read live below.
		const seed = orders.find((o) => o.id === params.orderId);
		if (!seed) throw notFound();
		const customer = customers.find((c) => c.email === seed.customer_email);
		return { id: seed.id, customer };
	},
	component: OrderDetailPage,
});

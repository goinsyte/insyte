import { createFileRoute, notFound } from "@tanstack/react-router";
import { customers } from "@insyte/ui/data-source";
import { orders } from "@insyte/ui/data-source";
import { DemoOrderDetail } from "@insyte/ui/app/orders/demo-detail";

export const Route = createFileRoute("/_admin/orders/$orderId")({
	loader: ({ params }) => {
		// The fixture answers "does this order exist" for a cold URL; the order is read live below.
		const seed = orders.find((o) => o.id === params.orderId);
		if (!seed) throw notFound();
		const customer = customers.find((c) => c.email === seed.customer_email);
		return { id: seed.id, customer };
	},
	component: OrderDetail,
});

function OrderDetail() {
	const { id, customer } = Route.useLoaderData();
	return <DemoOrderDetail id={id} customer={customer} />;
}

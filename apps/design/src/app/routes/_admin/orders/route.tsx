import { createFileRoute } from "@tanstack/react-router";
import { OrdersLayout } from "@insyte/ui/app/orders/orders-layout";

export const Route = createFileRoute("/_admin/orders")({
	component: OrdersLayout,
});

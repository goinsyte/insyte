import { createFileRoute } from "@tanstack/react-router";
import { ShippingPage } from "@insyte/ui/app/settings/depth/shipping-screen";

export const Route = createFileRoute("/_admin/settings/shipping")({
	component: ShippingPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { ChargebacksLayout } from "@insyte/ui/app/chargebacks/chargebacks-layout";

export const Route = createFileRoute("/_admin/chargebacks")({
	component: ChargebacksLayout,
});

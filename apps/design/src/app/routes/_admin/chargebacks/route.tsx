import { createFileRoute } from "@tanstack/react-router";
import { ChargebacksLayout } from "@insyte/ui/app/chargebacks/chargebacks-layout";
import { DemoChargebacksSource } from "@insyte/ui/app/chargebacks/demo-source";

export const Route = createFileRoute("/_admin/chargebacks")({
	component: () => (
		<DemoChargebacksSource>
			<ChargebacksLayout />
		</DemoChargebacksSource>
	),
});

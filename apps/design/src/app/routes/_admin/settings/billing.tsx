import { createFileRoute } from "@tanstack/react-router";
import { DemoBillingSource } from "@insyte/ui/app/settings/billing-demo-source";
import { BillingPage } from "@insyte/ui/app/settings/billing-screen";

export const Route = createFileRoute("/_admin/settings/billing")({
	component: () => (
		<DemoBillingSource>
			<BillingPage />
		</DemoBillingSource>
	),
});

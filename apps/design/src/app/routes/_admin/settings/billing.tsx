import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@insyte/ui/app/settings/billing-screen";

export const Route = createFileRoute("/_admin/settings/billing")({
	component: BillingPage,
});

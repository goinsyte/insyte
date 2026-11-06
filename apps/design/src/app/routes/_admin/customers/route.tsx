import { createFileRoute } from "@tanstack/react-router";
import { CustomersLayout } from "@insyte/ui/app/customers/customers-layout";

export const Route = createFileRoute("/_admin/customers")({
	component: CustomersLayout,
});

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useWorkspace } from "@insyte/ui/app/stores/workspace-store";
import { customers } from "@insyte/ui/data-source";
import { CustomerDetail } from "@insyte/ui/app/customers/customer-screen";

export const Route = createFileRoute("/_admin/customers/$customerId")({
	component: CustomerDetail,
	loader: ({ params }) => {
		const customer =
			customers.find((c) => c.id === params.customerId) ??
			useWorkspace.getState().createdCustomers.find((c) => c.id === params.customerId);
		if (!customer) throw notFound();
		return { customer };
	},
});

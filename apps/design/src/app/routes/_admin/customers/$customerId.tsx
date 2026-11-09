import { createFileRoute, notFound } from "@tanstack/react-router";
import { useWorkspace } from "@insyte/ui/app/stores/workspace-store";
import { customers } from "@insyte/ui/data-source";
import { DemoCustomerDetail } from "@insyte/ui/app/customers/demo-detail";

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

function CustomerDetail() {
	const { customer } = Route.useLoaderData();
	return <DemoCustomerDetail customer={customer} />;
}

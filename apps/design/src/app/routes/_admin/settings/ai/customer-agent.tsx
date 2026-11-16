import { createFileRoute } from "@tanstack/react-router";
import { DemoCustomerAgentSource } from "@insyte/ui/app/ai/customer-agent-demo-source";
import { CustomerAgentPage } from "@insyte/ui/app/ai/customer-agent-screen";

export const Route = createFileRoute("/_admin/settings/ai/customer-agent")({
	component: () => (
		<DemoCustomerAgentSource>
			<CustomerAgentPage />
		</DemoCustomerAgentSource>
	),
});

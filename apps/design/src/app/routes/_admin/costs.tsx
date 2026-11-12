import { createFileRoute } from "@tanstack/react-router";
import { DemoCostsSource } from "@insyte/ui/app/costs/costs-demo-source";
import { CostsPage } from "@insyte/ui/app/costs/costs-screen";

export const Route = createFileRoute("/_admin/costs")({
	component: CostsRoute,
});

function CostsRoute() {
	return (
		<DemoCostsSource>
			<CostsPage />
		</DemoCostsSource>
	);
}

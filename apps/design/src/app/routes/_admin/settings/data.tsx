import { createFileRoute } from "@tanstack/react-router";
import { YourDataPage } from "@insyte/ui/app/settings/data-screen";
import { DemoDataSource } from "@insyte/ui/app/settings/data-demo-source";

export const Route = createFileRoute("/_admin/settings/data")({
	component: () => (
		<DemoDataSource>
			<YourDataPage />
		</DemoDataSource>
	),
});

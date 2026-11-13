import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VIEWS } from "@insyte/ui/app/automations/automations-search";
import { AutomationsPage } from "@insyte/ui/app/automations/automations-screen";
import { DemoAutomationsSource } from "@insyte/ui/app/automations/demo-source";

export const Route = createFileRoute("/_admin/automations/")({
	validateSearch: z.object({ view: z.enum(VIEWS).optional() }),
	component: Page,
});

function Page() {
	const { view } = Route.useSearch();
	return (
		<DemoAutomationsSource>
			<AutomationsPage view={view} />
		</DemoAutomationsSource>
	);
}

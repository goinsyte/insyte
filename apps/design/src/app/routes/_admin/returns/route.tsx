import { createFileRoute } from "@tanstack/react-router";
import { DemoReturnsSource } from "@insyte/ui/app/returns/demo-source";
import { ReturnsLayout } from "@insyte/ui/app/returns/returns-screen";

export const Route = createFileRoute("/_admin/returns")({
	component: () => (
		<DemoReturnsSource>
			<ReturnsLayout />
		</DemoReturnsSource>
	),
});

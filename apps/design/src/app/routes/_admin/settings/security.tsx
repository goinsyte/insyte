import { createFileRoute } from "@tanstack/react-router";
import { DemoSecuritySource } from "@insyte/ui/app/settings/security-demo-source";
import { SecurityPage } from "@insyte/ui/app/settings/security-screen";

export const Route = createFileRoute("/_admin/settings/security")({
	component: () => (
		<DemoSecuritySource>
			<SecurityPage />
		</DemoSecuritySource>
	),
});

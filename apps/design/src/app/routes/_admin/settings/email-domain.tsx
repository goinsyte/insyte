import { createFileRoute } from "@tanstack/react-router";
import { DemoSettingsDepthSource } from "@insyte/ui/app/settings/depth/demo-source";
import { EmailDomainPage } from "@insyte/ui/app/settings/depth/email-domain-screen";

export const Route = createFileRoute("/_admin/settings/email-domain")({
	component: () => (
		<DemoSettingsDepthSource>
			<EmailDomainPage />
		</DemoSettingsDepthSource>
	),
});

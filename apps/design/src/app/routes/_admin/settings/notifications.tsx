import { createFileRoute } from "@tanstack/react-router";
import { DemoNotificationSettingsSource } from "@insyte/ui/app/settings/notifications-demo-source";
import { NotificationSettings } from "@insyte/ui/app/settings/notifications-screen";

export const Route = createFileRoute("/_admin/settings/notifications")({
	component: () => (
		<DemoNotificationSettingsSource>
			<NotificationSettings />
		</DemoNotificationSettingsSource>
	),
});

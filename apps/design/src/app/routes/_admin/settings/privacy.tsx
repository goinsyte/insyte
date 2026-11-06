import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@insyte/ui/app/settings/depth/privacy-screen";

export const Route = createFileRoute("/_admin/settings/privacy")({
	component: PrivacyPage,
});

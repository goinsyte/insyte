import { createFileRoute } from "@tanstack/react-router";
import { AffiliateSettingsLayout } from "@insyte/ui/app/affiliate/settings-layout";

export const Route = createFileRoute("/_aff/affiliate/settings")({
	component: AffiliateSettingsLayout,
});

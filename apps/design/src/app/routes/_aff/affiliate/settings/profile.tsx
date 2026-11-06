import { createFileRoute } from "@tanstack/react-router";
import { AffProfile } from "@insyte/ui/app/affiliate/settings-profile-screen";

export const Route = createFileRoute("/_aff/affiliate/settings/profile")({
	component: AffProfile,
});

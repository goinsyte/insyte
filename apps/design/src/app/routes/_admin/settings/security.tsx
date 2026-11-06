import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@insyte/ui/app/settings/security-screen";

export const Route = createFileRoute("/_admin/settings/security")({
	component: SecurityPage,
});

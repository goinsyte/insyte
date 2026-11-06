import { env } from "@insyte/ui/app/lib/env";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@insyte/ui/app/shell/app-shell";

export const Route = createFileRoute("/_supplier")({
	beforeLoad: () => {
		if (!env.VITE_DASHBOARD_ENABLED) throw redirect({ to: "/" });
	},
	component: () => <AppShell persona="supplier" />,
});

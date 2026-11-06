import { env } from "@insyte/ui/app/lib/env";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@insyte/ui/app/shell/app-shell";
import { authClient } from "@insyte/ui/app/lib/auth-client";

export const Route = createFileRoute("/_admin")({
	beforeLoad: async () => {
		if (!env.VITE_DASHBOARD_ENABLED) throw redirect({ to: "/" });
		// SSR can't see the browser's session cookie here, so defer the auth
		// check to the client (it re-runs on hydration). Proper SSR cookie
		// forwarding is a follow-up.
		if (typeof window === "undefined") return;
		const { data } = await authClient.getSession();
		if (!data?.session) throw redirect({ to: "/login" });
	},
	component: () => <AppShell persona="admin" />,
});

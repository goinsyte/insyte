import { env } from "@insyte/ui/app/lib/env";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApplicationPending } from "@insyte/ui/app/affiliate/application-pending";
import { ApplicationRejected } from "@insyte/ui/app/affiliate/application-rejected";
import { AppShell } from "@insyte/ui/app/shell/app-shell";
import { usePersonaSelection } from "@insyte/ui/app/hooks/use-persona";

export const Route = createFileRoute("/_aff")({
	beforeLoad: () => {
		if (!env.VITE_DASHBOARD_ENABLED) throw redirect({ to: "/" });
	},
	component: AffiliateLayout,
});

function AffiliateLayout() {
	const { affiliateState } = usePersonaSelection();

	if (affiliateState === "pending") {
		return (
			<AppShell persona="affiliate">
				<ApplicationPending />
			</AppShell>
		);
	}
	if (affiliateState === "rejected") {
		return (
			<AppShell persona="affiliate">
				<ApplicationRejected />
			</AppShell>
		);
	}
	return <AppShell persona="affiliate" />;
}

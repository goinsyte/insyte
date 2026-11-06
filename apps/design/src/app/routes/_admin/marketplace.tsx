import { createFileRoute } from "@tanstack/react-router";
import { MarketplaceRedirect } from "@insyte/ui/app/marketplace/marketplace-screen";

export const Route = createFileRoute("/_admin/marketplace")({
	component: MarketplaceRedirect,
});

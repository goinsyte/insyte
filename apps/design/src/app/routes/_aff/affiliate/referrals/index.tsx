import { createFileRoute } from "@tanstack/react-router";
import { AffiliateLinks } from "@insyte/ui/app/affiliate/referrals-screen";

export const Route = createFileRoute("/_aff/affiliate/referrals/")({
	component: AffiliateLinks,
});

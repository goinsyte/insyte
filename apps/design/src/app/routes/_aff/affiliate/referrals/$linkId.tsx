import { createFileRoute } from "@tanstack/react-router";
import { LinkDetail } from "@insyte/ui/app/affiliate/referral-screen";

export const Route = createFileRoute("/_aff/affiliate/referrals/$linkId")({
	component: LinkDetail,
});

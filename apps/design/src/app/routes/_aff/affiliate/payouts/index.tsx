import { createFileRoute } from "@tanstack/react-router";
import { Payouts } from "@insyte/ui/app/affiliate/payouts-screen";

export const Route = createFileRoute("/_aff/affiliate/payouts/")({
	component: Payouts,
});

import { createFileRoute } from "@tanstack/react-router";
import { AffPayment } from "@insyte/ui/app/affiliate/settings-payment-screen";

export const Route = createFileRoute("/_aff/affiliate/settings/payment")({
	component: AffPayment,
});

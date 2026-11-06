import { createFileRoute, notFound } from "@tanstack/react-router";
import { chargebacks } from "@insyte/ui/data-source";
import { ChargebackDetail } from "@insyte/ui/app/chargebacks/chargeback-screen";

export const Route = createFileRoute("/_admin/chargebacks/$chargebackId")({
	component: ChargebackDetail,
	loader: ({ params }) => {
		// The fixture answers "does this case exist" for a cold URL; the case itself is read live below.
		if (!chargebacks.some((x) => x.id === params.chargebackId)) throw notFound();
		return { id: params.chargebackId };
	},
});

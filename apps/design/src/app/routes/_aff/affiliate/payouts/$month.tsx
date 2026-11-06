import { createFileRoute, notFound } from "@tanstack/react-router";
import { affiliateStatements } from "@insyte/ui/data-source";
import { PayoutMonth } from "@insyte/ui/app/affiliate/payout-screen";

export const Route = createFileRoute("/_aff/affiliate/payouts/$month")({
	loader: ({ params }) => {
		const s = affiliateStatements().find((x) => x.id === params.month);
		if (!s) throw notFound();
		return { s };
	},
	component: PayoutMonth,
});

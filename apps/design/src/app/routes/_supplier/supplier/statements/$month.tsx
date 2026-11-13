import { createFileRoute, notFound } from "@tanstack/react-router";
import { statementsFor } from "@insyte/ui/app/lib/supplier-statements";
import { ME_SUPPLIER } from "@insyte/ui/app/lib/supplier-work";
import { DemoStatementPage } from "@insyte/ui/app/supplier/statements-demo";

export const Route = createFileRoute("/_supplier/supplier/statements/$month")({
	loader: ({ params }) => {
		const s = statementsFor(ME_SUPPLIER.id).find((x) => x.id === params.month);
		if (!s) throw notFound();
		return { s };
	},
	component: DemoStatementPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { DemoSuppliersSource } from "@insyte/ui/app/suppliers/demo-source";
import { SuppliersPage } from "@insyte/ui/app/suppliers/suppliers-screen";

export const Route = createFileRoute("/_admin/suppliers")({
	component: () => (
		<DemoSuppliersSource>
			<SuppliersPage />
		</DemoSuppliersSource>
	),
});

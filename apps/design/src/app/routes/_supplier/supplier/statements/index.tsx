import { createFileRoute } from "@tanstack/react-router";
import { SupplierStatements } from "@insyte/ui/app/supplier/statements-screen";

export const Route = createFileRoute("/_supplier/supplier/statements/")({
	component: SupplierStatements,
});

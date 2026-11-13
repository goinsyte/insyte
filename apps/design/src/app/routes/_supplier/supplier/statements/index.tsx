import { createFileRoute } from "@tanstack/react-router";
import { DemoSupplierStatements } from "@insyte/ui/app/supplier/statements-demo";

export const Route = createFileRoute("/_supplier/supplier/statements/")({
	component: DemoSupplierStatements,
});

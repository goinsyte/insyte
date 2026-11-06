import { createFileRoute } from "@tanstack/react-router";
import { SupplierTrainingPage } from "@insyte/ui/app/courses/supplier-training";

export const Route = createFileRoute("/_supplier/supplier/training/")({
	component: SupplierTrainingPage,
});

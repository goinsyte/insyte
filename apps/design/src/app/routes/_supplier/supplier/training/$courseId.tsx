import { createFileRoute } from "@tanstack/react-router";
import { SupplierCoursePage } from "@insyte/ui/app/courses/supplier-training";

export const Route = createFileRoute("/_supplier/supplier/training/$courseId")({
	component: SupplierCoursePage,
});

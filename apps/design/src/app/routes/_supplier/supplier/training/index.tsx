import { createFileRoute } from "@tanstack/react-router";
import { DemoCoursesSource } from "@insyte/ui/app/courses/demo-source";
import { SupplierTrainingPage } from "@insyte/ui/app/courses/supplier-training";
import { ME_SUPPLIER } from "@insyte/ui/app/lib/supplier-work";

export const Route = createFileRoute("/_supplier/supplier/training/")({
	component: () => (
		<DemoCoursesSource as={ME_SUPPLIER}>
			<SupplierTrainingPage />
		</DemoCoursesSource>
	),
});

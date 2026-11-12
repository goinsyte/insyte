import { createFileRoute } from "@tanstack/react-router";
import { type CoursesSearch, CoursesPage } from "@insyte/ui/app/courses/courses-screen";
import { DemoCoursesSource } from "@insyte/ui/app/courses/demo-source";

export const Route = createFileRoute("/_admin/courses/")({
	validateSearch: (s: Record<string, unknown>): CoursesSearch => ({ view: typeof s.view === "string" ? s.view : undefined }),
	component: () => (
		<DemoCoursesSource>
			<CoursesPage />
		</DemoCoursesSource>
	),
});

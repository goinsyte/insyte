import { createFileRoute } from "@tanstack/react-router";
import { CoursePlayerPage, type PlayerSearch } from "@insyte/ui/app/courses/course-player";

export const Route = createFileRoute("/_admin/courses/learn/$courseId")({
	validateSearch: (s: Record<string, unknown>): PlayerSearch => ({
		preview: typeof s.preview === "string" ? s.preview : undefined,
		block: typeof s.block === "string" ? s.block : undefined,
	}),
	component: CoursePlayerPage,
});

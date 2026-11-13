import { createFileRoute } from "@tanstack/react-router";
import { CourseEditorPage } from "@insyte/ui/app/courses/course-editor";
import { DemoCoursesSource } from "@insyte/ui/app/courses/demo-source";

export const Route = createFileRoute("/_admin/courses/$courseId")({
	component: () => (
		<DemoCoursesSource>
			<CourseEditorPage />
		</DemoCoursesSource>
	),
});

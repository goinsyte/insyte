import { createFileRoute } from "@tanstack/react-router";
import { CourseEditorPage } from "@insyte/ui/app/courses/course-editor";

export const Route = createFileRoute("/_admin/courses/$courseId")({
	component: CourseEditorPage,
});

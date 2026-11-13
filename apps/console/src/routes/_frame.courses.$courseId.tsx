import { CourseEditorPage } from "@insyte/ui/app/courses/course-editor"
import { createFileRoute } from "@tanstack/react-router"

/** One course, edited as one document (Cursussen · Bewerken; below it, read only), as in the reference. */
export const Route = createFileRoute("/_frame/courses/$courseId")({
  head: () => ({ meta: [{ title: "Cursus · Insyte" }] }),
  component: CourseEditorPage
})

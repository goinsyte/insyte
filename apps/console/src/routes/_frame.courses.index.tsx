import { CoursesPage, type CoursesSearch } from "@insyte/ui/app/courses/courses-screen"
import { createFileRoute } from "@tanstack/react-router"

/** The catalogue and its views (`?view=mine|team|questions|drafts|archived`), as in the reference. */
export const Route = createFileRoute("/_frame/courses/")({
  validateSearch: (s: Record<string, unknown>): CoursesSearch =>
    typeof s["view"] === "string" ? { view: s["view"] } : {},
  component: CoursesPage
})

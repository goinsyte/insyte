import { CoursePlayerPage, type PlayerSearch } from "@insyte/ui/app/courses/course-player"
import { createFileRoute } from "@tanstack/react-router"

/** A course, taken (or previewed, `?preview=1`), from a block (`?block=`), as in the reference. */
export const Route = createFileRoute("/_frame/courses/learn/$courseId")({
  validateSearch: (s: Record<string, unknown>): PlayerSearch => ({
    ...(typeof s["preview"] === "string" ? { preview: s["preview"] } : {}),
    ...(typeof s["block"] === "string" ? { block: s["block"] } : {})
  }),
  head: () => ({ meta: [{ title: "Cursus · Insyte" }] }),
  component: CoursePlayerPage
})

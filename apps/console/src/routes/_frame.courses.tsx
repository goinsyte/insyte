import { useAtomValue } from "@effect/atom-react"
import type { CourseCatalogue } from "@insyte/modules/courses/domain/Courses"
import { CoursesSourceProvider } from "@insyte/ui/app/courses/source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleCoursesSource } from "../courses/courses-source.tsx"
import { coursesAtom } from "../data/courses.ts"

/**
 * Cursussen (M17 step 4): the reference's catalogue, editor and player over `Courses.list`, in the frame. Every page
 * of the area reads the one catalogue, as far as the member may, so this layout reads it (on the server, the first
 * time) and hands it to the page below as the courses source. Until it is in, the page's own skeleton stands in: the
 * list for the catalogue, the document for a course.
 */
export const Route = createFileRoute("/_frame/courses")({
  head: () => ({ meta: [{ title: "Cursussen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(coursesAtom)
    if (typeof window !== "undefined" && Option.isSome(AsyncResult.value(context.registry.get(coursesAtom)))) return
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, coursesAtom)))
  },
  pendingComponent: Pending,
  component: CoursesLayout
})

function Pending() {
  const atList = useRouterState({ select: (s) => s.location.pathname.replace(/\/$/, "") === "/courses" })
  return atList ? <PageSkeleton kind="list" title="Cursussen" /> : <PageSkeleton kind="document" title="Cursus" />
}

function CoursesLayout() {
  const result = useAtomValue(coursesAtom)
  // A refresh keeps showing the catalogue as it was until the new one is in.
  const catalogue = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (catalogue === undefined) return <Pending />
  return <Loaded catalogue={catalogue} />
}

function Loaded({ catalogue }: { catalogue: CourseCatalogue }) {
  return (
    <CoursesSourceProvider value={useConsoleCoursesSource(catalogue)}>
      <Outlet />
    </CoursesSourceProvider>
  )
}

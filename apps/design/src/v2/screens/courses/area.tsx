import type { AreaDef } from "../../areas.ts"
import { QUESTIONS } from "../../fixtures/courses.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { paths } from "../../router.tsx"
import type { AreaRoute } from "../../router.tsx"
import type { Thread } from "../../shell/threads.ts"
import { CourseScreen } from "./editor.tsx"
import { CoursesList } from "./list.tsx"
import { LearnScreen } from "./player.tsx"
import { getCourse } from "./store.ts"

/** Werkdraad: a course, then its author. On the list: the open question and who asked it. */
function thread(route: AreaRoute): Thread {
  const [id] = route.path
  if (id === undefined) {
    const open = QUESTIONS.find((q) => q.answer === undefined)
    const course = open === undefined ? undefined : getCourse(open.courseId)
    return {
      items: [
        { kind: "page", label: "Cursussen" },
        ...(open === undefined || course === undefined ? [] : [
          {
            kind: "course" as const,
            label: course.title,
            href: `${paths.courses}?view=vragen`,
            meta: `open vraag van ${PEOPLE[open.person].name}`,
            peek: [open.text]
          },
          {
            kind: "person" as const,
            label: PEOPLE[open.person].name,
            href: paths.person(PEOPLE[open.person].id),
            meta: PEOPLE[open.person].role
          }
        ])
      ],
      ask: "Cursussen"
    }
  }
  const course = getCourse(id)
  if (course === undefined) {
    return { items: [{ kind: "page", label: "Cursussen", href: paths.courses }], ask: "Cursussen" }
  }
  const author = PEOPLE[course.author]
  return {
    items: [
      {
        kind: "course",
        label: course.title,
        href: paths.course(course.id),
        meta: `${course.blocks.length} blokken · ${course.status}`
      },
      { kind: "person", label: author.name, href: paths.person(author.id), meta: `schreef hem · ${author.role}` }
    ],
    ask: `Cursus ${course.title}`
  }
}

/** Cursussen: the area's entry for the shell (`areas.ts`). In the lead's "Meer" menu, so no Menu. */
export const area: AreaDef = {
  Screen: ({ route }) => {
    const [id, sub] = route.path
    if (id === undefined) return <CoursesList />
    return sub === "leren" ? <LearnScreen id={id} /> : <CourseScreen id={id} />
  },
  thread
}

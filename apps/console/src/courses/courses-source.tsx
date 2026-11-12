import { useAtomSet } from "@effect/atom-react"
import type { CourseCatalogue, CourseChange, CourseInput, CourseRow } from "@insyte/modules/courses/domain/Courses"
import type { CoursesSource, Learner, Said } from "@insyte/ui/app/courses/source"
import { type Block, type Course, type CourseQuestion, type Progress, reaches } from "@insyte/ui/app/lib/courses"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { useMemo } from "react"
import { toast } from "sonner"
import { COURSES, courseWrites } from "../data/courses.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Cursussen in the console (M17 step 4), over `Courses.*`: the catalogue as far as the member may read it, authoring
 * at Cursussen · Bewerken and removing and wiping progress at Beheren, each with "Ongedaan maken", and taking a course,
 * scored on the server. A learner's question shows its right answer once their own is in (`step` answers it). An image
 * goes up to the course (`PUT /api/courses/:id/media`) and reads back from `/api/files/:id`. Suppliers take courses in
 * their portal (M16), so the matrix has the team only; suggesting questions waits for the model.
 */

const iso = (ms: number) => new Date(ms).toISOString()
const FILE = /^\/api\/files\/([^/?#]+)$/

const blockOf = (b: CourseRow["blocks"][number]): Block =>
  b.kind === "image"
    ? {
      id: b.id,
      kind: "image",
      title: b.title,
      caption: b.caption,
      ...(b.fileId === null ? {} : { src: `/api/files/${b.fileId}` })
    }
    : b.kind === "quiz"
    ? { ...b, options: b.options.map((o) => ({ ...o })) }
    : { ...b }

export const courseOf = (c: CourseRow): Course => ({
  id: c.id,
  title: c.title,
  chapterId: c.chapterId,
  moduleId: c.moduleId,
  description: c.description,
  blocks: c.blocks.map(blockOf),
  status: c.status,
  order: c.order,
  audience: c.audience.kind === "some"
    ? { kind: "some", roles: [...c.audience.roles], members: [...c.audience.members] }
    : { kind: c.audience.kind },
  suppliers: c.suppliers.kind === "some" ? { kind: "some", ids: [...c.suppliers.ids] } : { kind: c.suppliers.kind },
  deadline: c.deadline,
  badge: c.badge,
  passMark: c.passMark,
  questions: c.questions,
  createdBy: c.createdBy,
  updatedAt: iso(c.updatedAt),
  ...(c.publishedAt === null ? {} : { publishedAt: iso(c.publishedAt) })
})

const PASS_MARKS = [50, 60, 70, 80, 90, 100] as const

/** The editor's draft as the server takes it: an image by its file, a pass mark on the ladder. */
const inputOf = (c: Course): CourseInput => ({
  title: c.title,
  description: c.description,
  chapterId: c.chapterId,
  moduleId: c.moduleId,
  blocks: c.blocks.map((b) =>
    b.kind === "image"
      ? { id: b.id, kind: "image", title: b.title, caption: b.caption, fileId: FILE.exec(b.src ?? "")?.[1] ?? null }
      : b.kind === "video"
      ? { ...b, minutes: Math.min(120, Math.max(1, Math.round(b.minutes))) }
      : b
  ),
  order: c.order,
  audience: c.audience,
  suppliers: c.suppliers,
  deadline: c.deadline,
  badge: c.badge,
  passMark: PASS_MARKS.find((m) => m >= c.passMark) ?? 100,
  questions: c.questions
})

const progressOf = (p: CourseCatalogue["progress"][number]): Progress => ({
  courseId: p.courseId,
  memberId: p.principalId,
  done: [...p.done],
  answers: { ...p.answers },
  attempts: p.attempts,
  ...(p.score === null ? {} : { score: p.score }),
  startedAt: iso(p.startedAt),
  ...(p.finishedAt === null ? {} : { finishedAt: iso(p.finishedAt) })
})

export const questionOf = (q: CourseCatalogue["questions"][number]): CourseQuestion => ({
  id: q.id,
  courseId: q.courseId,
  memberId: q.askerId,
  ...(q.blockId === null ? {} : { blockId: q.blockId }),
  text: q.text,
  at: iso(q.at),
  ...(q.answer === null ? {} : { answer: q.answer }),
  ...(q.answeredBy === null ? {} : { answeredBy: q.answeredBy })
})

/** What stands in the way of publishing, as the server names it; the editor shows the same in its own words. */
const BLOCKER: Record<string, string> = {
  title: "Geef de cursus een naam.",
  description: "Schrijf in een zin wat iemand leert.",
  blocks: "Voeg minstens één blok toe.",
  audience: "Kies wie de cursus ziet."
}

const COPY: RefusalCopy = {
  gone: "Die cursus bestaat niet meer",
  conflicts: {
    stale_version: [
      "Iemand anders was je voor",
      "De cursus is intussen opgeslagen. Laad hem opnieuw en probeer het nog eens."
    ],
    answered: ["Al beantwoord", "Iemand anders heeft deze vraag intussen beantwoord."],
    not_live: ["Niet live", "Herinneren kan alleen bij een gepubliceerde cursus."],
    in_use: ["Te laat om ongedaan te maken", "Er staat intussen een cursus in."]
  },
  invalid: {
    locked: "Rond eerst de blokken ervoor af.",
    unfinished: "Rond eerst elk blok af.",
    required: "Vul eerst iets in.",
    file: "Kies een afbeelding die bij deze cursus hoort."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "CourseNotReady": {
        const codes = (tagged["blockers"] as ReadonlyArray<string> | undefined) ?? []
        const first = codes.map((c) => BLOCKER[c] ?? "Een blok is nog niet af.")[0]
        toast.error("Nog niet klaar om te publiceren", { description: first })
        return true
      }
      case "CourseNotOpen":
        toast.error("Deze cursus staat niet voor je open", { description: "Hij is niet (meer) gepubliceerd voor jou." })
        return true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** A change with nothing to say when it takes (an order, a step): only a refusal is said. */
const quiet = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isFailure(exit)) refused(failureOf(exit))
}

const UPLOAD: Record<number, string> = {
  403: "Je rol mist Cursussen · Bewerken.",
  413: "Kies er een tot 1,5 MB, of verklein hem eerst.",
  415: "Kies een PNG, JPG of WebP."
}

export function useConsoleCoursesSource(catalogue: CourseCatalogue): CoursesSource {
  const write = {
    addChapter: useAtomSet(courseWrites.addChapter, { mode: "promiseExit" }),
    renameChapter: useAtomSet(courseWrites.renameChapter, { mode: "promiseExit" }),
    addModule: useAtomSet(courseWrites.addModule, { mode: "promiseExit" }),
    orderChapters: useAtomSet(courseWrites.orderChapters, { mode: "promiseExit" }),
    create: useAtomSet(courseWrites.create, { mode: "promiseExit" }),
    save: useAtomSet(courseWrites.save, { mode: "promiseExit" }),
    publish: useAtomSet(courseWrites.publish, { mode: "promiseExit" }),
    setStatus: useAtomSet(courseWrites.setStatus, { mode: "promiseExit" }),
    duplicate: useAtomSet(courseWrites.duplicate, { mode: "promiseExit" }),
    remove: useAtomSet(courseWrites.remove, { mode: "promiseExit" }),
    orderCourses: useAtomSet(courseWrites.orderCourses, { mode: "promiseExit" }),
    remind: useAtomSet(courseWrites.remind, { mode: "promiseExit" }),
    step: useAtomSet(courseWrites.step, { mode: "promiseExit" }),
    finish: useAtomSet(courseWrites.finish, { mode: "promiseExit" }),
    retake: useAtomSet(courseWrites.retake, { mode: "promiseExit" }),
    reset: useAtomSet(courseWrites.reset, { mode: "promiseExit" }),
    ask: useAtomSet(courseWrites.ask, { mode: "promiseExit" }),
    answer: useAtomSet(courseWrites.answer, { mode: "promiseExit" }),
    undo: useAtomSet(courseWrites.undo, { mode: "promiseExit" })
  }
  const keys = { reactivityKeys: COURSES }
  const undo = (token: string, after?: () => void) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      after?.()
    })
  /** The change said once, with its Undo where it has one; its record's id, or nothing when refused. */
  const said = (exit: Exit.Exit<CourseChange, unknown>, s: Said, undone?: () => void) => {
    if (Exit.isFailure(exit)) {
      refused(failureOf(exit))
      undone?.()
      return undefined
    }
    const ticket = exit.value.undo
    if (ticket === null) toast.success(s.label, { description: s.detail })
    else undoable(s.label, () => undo(ticket.token, undone), s.detail)
    return exit.value.id ?? undefined
  }

  const view = useMemo(() => {
    const roleLabels = new Map(catalogue.roles.map((r) => [r.id, r.label]))
    for (const p of catalogue.people) roleLabels.set(p.roleId, p.roleLabel)
    const names = new Map(catalogue.people.map((p) => [p.id, p.name]))
    names.set(catalogue.me.id, catalogue.me.name)
    const team: ReadonlyArray<Learner> = catalogue.people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.roleLabel,
      reach: (c: Course) => reaches(c, { id: p.id, role: p.roleId })
    }))
    return {
      chapters: catalogue.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        modules: c.modules.map((m) => ({ ...m }))
      })),
      courses: catalogue.courses.map(courseOf),
      progress: catalogue.progress.map(progressOf),
      questions: catalogue.questions.map(questionOf),
      team,
      roleLabels,
      names
    }
  }, [catalogue])

  const me = { id: catalogue.me.id, name: catalogue.me.name, role: catalogue.me.roleId }
  // The audience stores role ids; who reads Mijn cursussen is matched by theirs.
  const team = view.team.some((m) => m.id === me.id)
    ? view.team
    : [...view.team, { id: me.id, name: me.name, role: "", reach: (c: Course) => reaches(c, me) }]

  return {
    chapters: view.chapters,
    courses: view.courses,
    progress: view.progress,
    questions: view.questions,
    team,
    partners: [],
    nameOf: (id) => view.names.get(id),
    roles: catalogue.roles,
    roleLabel: (id) => view.roleLabels.get(id) ?? "Verwijderde rol",
    suppliers: catalogue.suppliers,
    me,
    manage: useGate("courses", 2),
    admin: useGate("courses", 3),
    commands: {
      addChapter: async (title, s) => void said(await write.addChapter({ payload: { title }, ...keys }), s),
      renameChapter: async (id, title, s) =>
        void said(await write.renameChapter({ payload: { id, title }, ...keys }), s),
      addModule: async (chapterId, title, s) =>
        void said(await write.addModule({ payload: { chapterId, title }, ...keys }), s),
      orderChapters: async (ids) => quiet(await write.orderChapters({ payload: { ids: [...ids] }, ...keys })),
      orderCourses: async (moduleId, ids) =>
        quiet(await write.orderCourses({ payload: { moduleId, ids: [...ids] }, ...keys })),
      create: async (draft) => {
        const exit = await write.create({
          payload: {
            title: draft.title,
            ...(draft.newChapter === undefined
              ? { chapterId: draft.chapterId, moduleId: draft.moduleId }
              : { newChapterTitle: draft.newChapter })
          },
          ...keys
        })
        if (Exit.isFailure(exit)) return void refused(failureOf(exit))
        return exit.value.id ?? undefined
      },
      save: async (saved, next, s) =>
        void said(
          await write.save({
            payload: { id: saved.id, course: inputOf(next), expectedUpdatedAt: Date.parse(saved.updatedAt) },
            ...keys
          }),
          s
        ),
      publish: async (saved, next, s) =>
        void said(
          await write.publish({
            payload: { id: saved.id, course: inputOf(next), expectedUpdatedAt: Date.parse(saved.updatedAt) },
            ...keys
          }),
          s
        ),
      setStatus: async (id, status, s) =>
        void said(await write.setStatus({ payload: { ids: [id], status }, ...keys }), s),
      duplicate: async (id, s) => {
        const title = view.courses.find((c) => c.id === id)?.title ?? ""
        void said(await write.duplicate({ payload: { id }, ...keys }), s(`${title} (kopie)`))
      },
      remove: async (id, s) => void said(await write.remove({ payload: { ids: [id] }, ...keys }), s),
      remind: async (courseId, learnerId, s, undone) =>
        void said(await write.remind({ payload: { courseId, memberId: learnerId }, ...keys }), s, undone),
      step: async (courseId, blockId, answer) => {
        const exit = await write.step({
          payload: { courseId, blockId, ...(answer === undefined ? {} : { answer }) },
          ...keys
        })
        if (Exit.isFailure(exit)) return void refused(failureOf(exit))
        const { correct, explain } = exit.value
        return correct === null ? undefined : { correct, explain: explain ?? "" }
      },
      finish: async (courseId) => {
        const exit = await write.finish({ payload: { courseId }, ...keys })
        if (Exit.isFailure(exit)) return void refused(failureOf(exit))
        return exit.value.score
      },
      retake: async (courseId) => quiet(await write.retake({ payload: { courseId }, ...keys })),
      reset: async (courseId, learnerId, s) =>
        void said(await write.reset({ payload: { courseId, memberId: learnerId }, ...keys }), s),
      ask: async (q, s) =>
        void said(
          await write.ask({
            payload: { courseId: q.courseId, text: q.text, ...(q.blockId === undefined ? {} : { blockId: q.blockId }) },
            ...keys
          }),
          s
        ),
      answer: async (id, text, s) => void said(await write.answer({ payload: { id, text }, ...keys }), s)
    },
    uploadImage: async (courseId, file) => {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/media`, {
        method: "PUT",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name)
        },
        body: file
      }).catch(() => null)
      if (response?.status !== 201) {
        toast.error("De afbeelding kwam niet door", {
          description: UPLOAD[response?.status ?? 0] ?? "Probeer het zo nog eens."
        })
        return undefined
      }
      const { id } = (await response.json()) as { id: string }
      return `/api/files/${id}`
    }
  }
}

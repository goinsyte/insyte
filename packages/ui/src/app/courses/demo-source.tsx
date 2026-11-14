import { type ReactNode, useMemo } from "react"
import { suppliers } from "../../data-source"
import { useMyName } from "../ask/agent-demo"
import { ME } from "../lib/assignees"
import { type Course, reaches, suggestQuestions } from "../lib/courses"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useCourses } from "../stores/courses-store"
import { useWorkspace } from "../stores/workspace-store"
import { type CoursesSource, CoursesSourceProvider, type Learner } from "./source"

/*
 * The courses screens over the design app's courses store, as they were before the seam (`source.tsx`): the store's
 * chapters, courses, progress and questions, the workspace's team and the suppliers a live course is open to, the
 * access store's Team · Bewerken for authoring, and each command's Undo. `as` takes a course as someone else (the
 * supplier portal's Training).
 */

const openTo = (c: Course, supplierId: string) =>
  c.status === "live" &&
  (c.suppliers.kind === "all" || (c.suppliers.kind === "some" && c.suppliers.ids.includes(supplierId)))

const readImage = (file: File) =>
  new Promise<string | undefined>((resolve) => {
    const r = new FileReader()
    r.addEventListener("load", () => resolve(String(r.result)))
    r.addEventListener("error", () => resolve(undefined))
    r.readAsDataURL(file)
  })

export function DemoCoursesSource(
  { as, children }: { as?: { id: string; name: string } | undefined; children: ReactNode }
) {
  const chapters = useCourses((s) => s.chapters)
  const courses = useCourses((s) => s.courses)
  const progress = useCourses((s) => s.progress)
  const questions = useCourses((s) => s.questions)
  const members = useWorkspace((s) => s.members)
  const myName = useMyName()
  const manage = useGate("team", 2)
  const team = useMemo<ReadonlyArray<Learner>>(
    () =>
      members.filter((m) => m.status === "active").map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        reach: (c: Course) => reaches(c, m)
      })),
    [members]
  )
  const partners = useMemo<ReadonlyArray<Learner>>(
    () =>
      suppliers.filter((sp) => courses.some((c) => openTo(c, sp.id))).map((sp) => ({
        id: sp.id,
        name: sp.name,
        role: "Leverancier",
        reach: (c: Course) => openTo(c, sp.id)
      })),
    [courses]
  )
  const roles = useMemo(() => [...new Set(members.map((m) => m.role))].map((r) => ({ id: r, label: r })), [members])
  const mine = members.find((m) => m.id === ME)
  const me = as ? { ...as, role: "Leverancier" } : { id: ME, name: myName, role: mine?.role ?? "" }
  const store = useCourses.getState

  const source: CoursesSource = {
    chapters,
    courses,
    progress,
    questions,
    team,
    partners,
    nameOf: (id) => members.find((m) => m.id === id)?.name,
    roles,
    roleLabel: (id) => id,
    suppliers,
    me,
    manage,
    admin: manage,
    commands: {
      addChapter: (title, s) => undoable(s.label, store().addChapter(title).undo, s.detail),
      renameChapter: (id, title, s) => undoable(s.label, store().renameChapter(id, title), s.detail),
      addModule: (chapterId, title, s) => undoable(s.label, store().addModule(chapterId, title).undo, s.detail),
      orderChapters: (ids) => store().orderChapters(ids),
      orderCourses: (_moduleId, ids) => store().orderCourses(ids),
      create: (draft) => {
        let chapterId = draft.chapterId
        let moduleId = draft.moduleId
        if (draft.newChapter !== undefined) {
          chapterId = store().addChapter(draft.newChapter).id
          moduleId = store().chapters.find((c) => c.id === chapterId)?.modules[0]?.id
        }
        if (!chapterId || !moduleId) return Promise.resolve(undefined)
        return Promise.resolve(store().create({ title: draft.title, chapterId, moduleId }, myName).id)
      },
      save: (saved, next, s) => undoable(s.label, store().save(saved.id, next), s.detail),
      publish: (saved, next, s) => {
        const before = store().courses
        store().save(saved.id, { ...next, status: "live", publishedAt: next.publishedAt ?? new Date().toISOString() })
        undoable(s.label, () => useCourses.setState({ courses: before }), s.detail)
      },
      setStatus: (id, status, s) => undoable(s.label, store().setStatus([id], status), s.detail),
      duplicate: (id, said) => {
        const copy = store().duplicate(id, myName)
        if (!copy) return
        const s = said(copy.title)
        undoable(s.label, store().remove([copy.id]), s.detail)
      },
      remove: (id, s) => undoable(s.label, store().remove([id]), s.detail),
      // The reference sends nothing: the toast is the whole of it.
      remind: (_courseId, _learnerId, s, undone) => undoable(s.label, undone, s.detail),
      step: (courseId, blockId, answer) => {
        store().step(courseId, me.id, blockId, answer)
        return Promise.resolve(undefined)
      },
      finish: (courseId) => Promise.resolve(store().finish(courseId, me.id)),
      retake: (courseId) => store().retake(courseId, me.id),
      reset: (courseId, learnerId, s) => undoable(s.label, store().reset(courseId, learnerId), s.detail),
      ask: (q, s) => undoable(s.label, store().ask({ ...q, memberId: me.id }), s.detail),
      answer: (id, text, s) => undoable(s.label, store().answer(id, text, myName), s.detail)
    },
    suggest: suggestQuestions,
    uploadImage: (_courseId, file) => readImage(file)
  }
  return <CoursesSourceProvider value={source}>{children}</CoursesSourceProvider>
}

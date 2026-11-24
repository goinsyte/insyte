import { useSyncExternalStore } from "react"
import { BUSY_CHAPTER, BUSY_COURSES, CHAPTERS, COURSES, PROGRESS, QUESTIONS } from "../../fixtures/courses.ts"
import type { Block, Chapter, Course, Progress, Question } from "../../fixtures/courses.ts"
import { useView } from "../../view.ts"

/**
 * What the demo changes about the courses while it is looked at: a new or edited course, a published
 * draft, an answered or new question, and Elena's own progress through a course. Module state.
 */

/** Elena's run through one course: the blocks she finished and what she answered. */
export type Run = {
  readonly done: ReadonlyArray<string>
  readonly answers: Readonly<Record<string, number>>
  readonly finished?: { readonly score: number; readonly passed: boolean }
}

type Module = Chapter["modules"][number]

type State = {
  readonly created: ReadonlyArray<Course>
  readonly removed: ReadonlyArray<string>
  readonly patches: Readonly<Record<string, Partial<Course>>>
  readonly questions: ReadonlyArray<Question>
  readonly answers: Readonly<Record<string, { readonly answer: string; readonly answeredBy: string }>>
  readonly runs: Readonly<Record<string, Run>>
  /** Chapters and modules added or renamed. */
  readonly chapters: ReadonlyArray<Chapter>
  readonly titles: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, ReadonlyArray<Module>>>
  /** Reminders sent, as `course:person`. */
  readonly reminded: ReadonlyArray<string>
}

let state: State = {
  created: [],
  removed: [],
  patches: {},
  questions: [],
  answers: {},
  runs: {},
  chapters: [],
  titles: {},
  modules: {},
  reminded: []
}
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const useStore = () => useSyncExternalStore(subscribe, () => state)

export function useCourses(): ReadonlyArray<Course> {
  const s = useStore()
  const view = useView()
  const base = view.staat === "leeg" ? [] : view.staat === "druk" ? [...COURSES, ...BUSY_COURSES] : COURSES
  return [...s.created, ...base].filter((c) => !s.removed.includes(c.id)).map((c) => ({ ...c, ...s.patches[c.id] }))
}

export function useChapters(): ReadonlyArray<Chapter> {
  const s = useStore()
  const view = useView()
  const base = view.staat === "leeg" ? [] : view.staat === "druk" ? [...CHAPTERS, BUSY_CHAPTER] : CHAPTERS
  return [...base, ...s.chapters].map((ch) => ({
    ...ch,
    title: s.titles[ch.id] ?? ch.title,
    modules: [...ch.modules, ...(s.modules[ch.id] ?? [])].map((m) => ({ ...m, title: s.titles[m.id] ?? m.title }))
  }))
}

export function useReminded(): ReadonlyArray<string> {
  return useStore().reminded
}

export function useQuestions(): ReadonlyArray<Question> {
  const s = useStore()
  const view = useView()
  const base = view.staat === "leeg" ? [] : QUESTIONS
  return [...s.questions, ...base].map((q) => ({ ...q, ...s.answers[q.id] }))
}

export function useProgress(): ReadonlyArray<Progress> {
  const view = useView()
  return view.staat === "leeg" ? [] : PROGRESS
}

export function useRun(courseId: string): Run {
  const s = useStore()
  return s.runs[courseId] ?? { done: [], answers: {} }
}

/** For the werkdraad, outside React. */
export const getCourse = (id: string) => {
  const c = [...state.created, ...COURSES, ...BUSY_COURSES].find((x) => x.id === id)
  return c === undefined ? undefined : { ...c, ...state.patches[id] }
}

export function patchCourse(id: string, next: Partial<Course>) {
  set({ ...state, patches: { ...state.patches, [id]: { ...state.patches[id], ...next, updated: "zojuist" } } })
}

export function setBlocks(id: string, blocks: ReadonlyArray<Block>) {
  patchCourse(id, { blocks })
}

let made = 0

const restore = (before: State) => () => set({ ...state, ...pick(before) })
const pick = (s: State) => ({
  created: s.created,
  removed: s.removed,
  patches: s.patches,
  chapters: s.chapters,
  titles: s.titles,
  modules: s.modules,
  reminded: s.reminded
})

/** A new chapter, with a first module so a course has somewhere to go. Returns the undo. */
export function addChapter(title: string): () => void {
  made += 1
  const before = state
  const chapter: Chapter = { id: `hoofdstuk-${made}`, title, modules: [{ id: `module-${made}`, title: "Algemeen" }] }
  set({ ...state, chapters: [...state.chapters, chapter] })
  return restore(before)
}

/** A module at the end of a chapter. Returns the undo. */
export function addModule(chapterId: string, title: string): () => void {
  made += 1
  const before = state
  const list = state.modules[chapterId] ?? []
  set({ ...state, modules: { ...state.modules, [chapterId]: [...list, { id: `module-${made}`, title }] } })
  return restore(before)
}

/** Renames a chapter or a module. Returns the undo. */
export function rename(id: string, title: string): () => void {
  const before = state
  set({ ...state, titles: { ...state.titles, [id]: title } })
  return restore(before)
}

/** A copy as a draft, with the same blocks and settings. */
export function duplicateCourse(c: Course): string {
  made += 1
  const id = `${c.id}-kopie-${made}`
  const copy: Course = {
    ...c,
    id,
    title: `${c.title} (kopie)`,
    status: "concept",
    author: "elena",
    updated: "zojuist",
    overdue: false,
    blocks: c.blocks.map((b, i) => ({ ...b, id: `${id}-${i + 1}` }))
  }
  set({ ...state, created: [copy, ...state.created] })
  return id
}

/** Removes a course and returns the undo. */
export function removeCourse(id: string): () => void {
  const before = state
  set({ ...state, removed: [...state.removed, id] })
  return restore(before)
}

export function remind(courseId: string, person: string) {
  set({ ...state, reminded: [...state.reminded, `${courseId}:${person}`] })
}

export function createCourse(title: string, chapterId: string, moduleId: string): string {
  made += 1
  const id = `nieuw-${made}`
  const course: Course = {
    id,
    title,
    chapterId,
    moduleId,
    description: "",
    status: "concept",
    audience: { kind: "all" },
    badge: "star",
    passMark: 80,
    order: "vrij",
    questions: true,
    suppliers: [],
    author: "elena",
    updated: "zojuist",
    blocks: []
  }
  set({ ...state, created: [course, ...state.created] })
  return id
}

export function answer(questionId: string, text: string) {
  set({ ...state, answers: { ...state.answers, [questionId]: { answer: text, answeredBy: "Elena Hart" } } })
}

export function ask(courseId: string, blockId: string, text: string) {
  made += 1
  const q: Question = { id: `vraag-nieuw-${made}`, courseId, person: "elena", blockId, text, at: "zojuist" }
  set({ ...state, questions: [q, ...state.questions] })
}

export function setRun(courseId: string, run: Run) {
  set({ ...state, runs: { ...state.runs, [courseId]: run } })
}

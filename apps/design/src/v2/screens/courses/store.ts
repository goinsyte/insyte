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

type State = {
  readonly created: ReadonlyArray<Course>
  readonly patches: Readonly<Record<string, Partial<Course>>>
  readonly questions: ReadonlyArray<Question>
  readonly answers: Readonly<Record<string, { readonly answer: string; readonly answeredBy: string }>>
  readonly runs: Readonly<Record<string, Run>>
}

let state: State = { created: [], patches: {}, questions: [], answers: {}, runs: {} }
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
  return [...s.created, ...base].map((c) => ({ ...c, ...s.patches[c.id] }))
}

export function useChapters(): ReadonlyArray<Chapter> {
  const view = useView()
  return view.staat === "leeg" ? [] : view.staat === "druk" ? [...CHAPTERS, BUSY_CHAPTER] : CHAPTERS
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

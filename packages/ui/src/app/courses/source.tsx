import { createContext, type ReactElement, useContext } from "react"
import { Blocked } from "../access/blocked"
import type { Block, Chapter, Course, CourseQuestion, Progress } from "../lib/courses"
import type { TeamGate } from "../orders/source"

/**
 * What the courses screens read and do, from whoever hosts them (as `quality/source.tsx` is for the Kwaliteit tab): the
 * design app from its courses store, the console from `Courses.*` (M17 step 4). The markup is the design's. Times are
 * ISO strings and an image block's `src` a URL, as `lib/courses.ts` has them; what the host cannot do yet is absent
 * (suggesting quiz questions until the model is there, suppliers until their portal).
 */

export type { TeamGate }

/** What a change said, with its Undo where it has one. */
export type Said = { label: string; detail?: string | undefined }

/** Someone a course can be for: a teammate, or a supplier a live course is open to. */
export type Learner = {
  id: string
  name: string
  /** What the matrix says under the name: the role, or "Leverancier". */
  role: string
  reach: (c: Course) => boolean
}

/** What a question checked says, where the host only tells the right answer once the learner's is in. */
export type Checked = { correct: string; explain: string }

export interface CoursesCommands {
  /** A chapter with its first module, "Algemeen". */
  addChapter: (title: string, said: Said) => void
  renameChapter: (id: string, title: string, said: Said) => void
  addModule: (chapterId: string, title: string, said: Said) => void
  /** The chapters in this order. */
  orderChapters: (ids: ReadonlyArray<string>) => void
  /** A module's courses in this order. */
  orderCourses: (moduleId: string, ids: ReadonlyArray<string>) => void
  /** A draft in a module, or in a new chapter when there is none; answers its id, or nothing when refused. */
  create: (draft: { title: string; chapterId?: string; moduleId?: string; newChapter?: string }) => Promise<
    string | undefined
  >
  /** The editor's draft; `publish` makes it live in the same move. */
  save: (saved: Course, next: Course, said: Said) => void
  publish: (saved: Course, next: Course, said: Said) => void
  setStatus: (id: string, status: Course["status"], said: Said) => void
  duplicate: (id: string, said: (title: string) => Said) => void
  remove: (id: string, said: Said) => void
  /** "Herinneren": one person who has the course to do hears of it; `undone` when its Undo is taken. */
  remind: (courseId: string, learnerId: string, said: Said, undone: () => void) => void
  /** A block read, or a question answered; the host may answer what the question checks. */
  step: (courseId: string, blockId: string, answer?: string) => Promise<Checked | undefined>
  /** Scores the attempt and closes it; the score, or nothing when refused. */
  finish: (courseId: string) => Promise<number | undefined>
  retake: (courseId: string) => void
  /** Clears a person's progress so they take the course again from the start. */
  reset: (courseId: string, learnerId: string, said: Said) => void
  ask: (q: { courseId: string; blockId?: string | undefined; text: string }, said: Said) => void
  answer: (id: string, text: string, said: Said) => void
}

export interface CoursesSource {
  chapters: ReadonlyArray<Chapter>
  courses: ReadonlyArray<Course>
  progress: ReadonlyArray<Progress>
  questions: ReadonlyArray<CourseQuestion>
  /** The active team, and the suppliers a live course is open to (where the host has them). */
  team: ReadonlyArray<Learner>
  partners: ReadonlyArray<Learner>
  /** A teammate's name by id, also once they left; `undefined` for someone unknown. */
  nameOf: (id: string) => string | undefined
  /** The roles the editor's audience chips offer, and how a course's audience names them. */
  roles: ReadonlyArray<{ id: string; label: string }>
  roleLabel: (id: string) => string
  /** The suppliers a course can be opened to. */
  suppliers: ReadonlyArray<{ id: string; name: string }>
  /** Who is reading: their id for their own progress, and their role for what reaches them. */
  me: { id: string; name: string; role: string }
  /** Making, editing and publishing courses, and answering questions; removing them and wiping progress. */
  manage: TeamGate
  admin: TeamGate
  commands: CoursesCommands
  /** "Vragen laten voorstellen": questions from the text blocks, where the host can make them. */
  suggest?: ((c: Pick<Course, "blocks">) => Array<Extract<Block, { kind: "quiz" }>>) | undefined
  /** An image for a block, kept by the host; its URL, or nothing when refused. */
  uploadImage: (courseId: string, file: File) => Promise<string | undefined>
}

const CoursesContext = createContext<CoursesSource | null>(null)

export const CoursesSourceProvider = CoursesContext.Provider

export function useCoursesSource(): CoursesSource {
  const source = useContext(CoursesContext)
  if (source === null) throw new Error("The courses screens need a CoursesSourceProvider around them.")
  return source
}

/** A control the role may not use: still there, disabled, with what is missing (as `access/gate.tsx`). */
export function SourceGate({ gate, children }: { gate: TeamGate; children: ReactElement }) {
  if (gate.ok) return children
  return <Blocked reason={gate.reason}>{children}</Blocked>
}

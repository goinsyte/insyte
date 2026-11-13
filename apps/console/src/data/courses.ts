import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { CourseCatalogue } from "@insyte/modules/courses/domain/Courses"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Cursussen (M17 step 4): the catalogue in one read, as far as the member may (`Courses.list`), primed by the route's
 * loader; the commands, each naming `COURSES`. A course, a question or someone's progress changed elsewhere refetches
 * it (`course`, `course_question`).
 */

export const COURSES = ["courses"] as const

const errors = Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const coursesAtom = Atom.serializable(
  ConsoleClient.query("Courses.list", undefined, { reactivityKeys: COURSES }),
  { key: "courses", schema: AsyncResult.Schema({ success: CourseCatalogue, error: errors }), skipInitialRun: true }
)

export const courseWrites = {
  addChapter: ConsoleClient.mutation("CourseChapters.add"),
  renameChapter: ConsoleClient.mutation("CourseChapters.rename"),
  addModule: ConsoleClient.mutation("CourseChapters.addModule"),
  orderChapters: ConsoleClient.mutation("CourseChapters.reorder"),
  create: ConsoleClient.mutation("Courses.create"),
  save: ConsoleClient.mutation("Courses.save"),
  publish: ConsoleClient.mutation("Courses.publish"),
  setStatus: ConsoleClient.mutation("Courses.setStatus"),
  duplicate: ConsoleClient.mutation("Courses.duplicate"),
  remove: ConsoleClient.mutation("Courses.remove"),
  orderCourses: ConsoleClient.mutation("Courses.reorder"),
  remind: ConsoleClient.mutation("Courses.remind"),
  step: ConsoleClient.mutation("CourseProgress.step"),
  finish: ConsoleClient.mutation("CourseProgress.finish"),
  retake: ConsoleClient.mutation("CourseProgress.retake"),
  reset: ConsoleClient.mutation("CourseProgress.reset"),
  ask: ConsoleClient.mutation("CourseQuestions.ask"),
  answer: ConsoleClient.mutation("CourseQuestions.answer"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

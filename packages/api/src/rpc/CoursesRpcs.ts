import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AddModuleInput,
  AnswerInput,
  AskInput,
  CourseCatalogue,
  CourseChange,
  CourseIdInput,
  CourseNotOpen,
  CourseNotReady,
  CreateInput,
  FinishResult,
  IdInput,
  IdsInput,
  RemindInput,
  RenameInput,
  ReorderChaptersInput,
  ReorderCoursesInput,
  ResetInput,
  SaveInput,
  SetStatusInput,
  StepInput,
  StepResult,
  TitleInput
} from "@insyte/modules/courses/domain/Courses"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Courses (M17 step 4; api.md §2.33): the catalogue in one read, authoring with Undo, and taking a course. Console only
 * (`courses` is not on the REST surface or MCP in this step). Supplier contacts take courses through the portal (M16).
 */
export class CoursesRpcs extends RpcGroup.make(
  Rpc.make("Courses.list", { success: CourseCatalogue }),
  Rpc.make("CourseChapters.add", {
    payload: TitleInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid])
  }),
  Rpc.make("CourseChapters.rename", {
    payload: RenameInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("CourseChapters.addModule", {
    payload: AddModuleInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("CourseChapters.renameModule", {
    payload: RenameInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("CourseChapters.reorder", { payload: ReorderChaptersInput, success: CourseChange, error: Forbidden }),
  Rpc.make("Courses.create", {
    payload: CreateInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Courses.save", {
    payload: SaveInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict, CourseNotReady])
  }),
  Rpc.make("Courses.publish", {
    payload: SaveInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict, CourseNotReady])
  }),
  Rpc.make("Courses.setStatus", {
    payload: SetStatusInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, NotFound, CourseNotReady])
  }),
  Rpc.make("Courses.duplicate", {
    payload: IdInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Courses.remove", { payload: IdsInput, success: CourseChange, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Courses.restore", { payload: IdsInput, success: CourseChange, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Courses.reorder", {
    payload: ReorderCoursesInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Courses.remind", {
    payload: RemindInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("CourseProgress.step", {
    payload: StepInput,
    success: StepResult,
    error: Schema.Union([Invalid, NotFound, CourseNotOpen])
  }),
  Rpc.make("CourseProgress.finish", {
    payload: CourseIdInput,
    success: FinishResult,
    error: Schema.Union([Invalid, CourseNotOpen])
  }),
  Rpc.make("CourseProgress.retake", { payload: CourseIdInput, error: CourseNotOpen }),
  Rpc.make("CourseProgress.reset", {
    payload: ResetInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("CourseQuestions.ask", {
    payload: AskInput,
    success: CourseChange,
    error: Schema.Union([Invalid, NotFound, CourseNotOpen])
  }),
  Rpc.make("CourseQuestions.answer", {
    payload: AnswerInput,
    success: CourseChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../shared/domain/Documents.ts"
import { Relay } from "../shared/domain/Outbox.ts"
import type {
  AddModuleInput,
  AnswerInput,
  AskInput,
  CourseCatalogue,
  CourseChange,
  CourseNotOpen,
  CourseNotReady,
  CreateInput,
  FinishResult,
  RemindInput,
  ReorderCoursesInput,
  ResetInput,
  SaveInput,
  SetStatusInput,
  StepInput,
  StepResult
} from "./domain/Courses.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Learn from "./use-cases/learn.ts"
import * as Media from "./use-cases/media.ts"
import * as Read from "./use-cases/read.ts"

type R = Db | CurrentPrincipal
type Change<E> = Effect.Effect<CourseChange, Forbidden | E, R>

/**
 * Courses (M17 step 4): the catalogue and what is done in it, as the request's principal: authoring at Cursussen ·
 * Bewerken, deleting and wiping someone's progress at Beheren, and taking a course, which needs no level. The relay's
 * kick and the file store are ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class CoursesService extends Context.Service<CoursesService, {
  readonly list: Effect.Effect<CourseCatalogue, never, R>
  readonly addChapter: (input: { readonly title: string }) => Change<Invalid>
  readonly renameChapter: (input: { readonly id: string; readonly title: string }) => Change<Invalid | NotFound>
  readonly addModule: (input: typeof AddModuleInput.Type) => Change<Invalid | NotFound>
  readonly renameModule: (input: { readonly id: string; readonly title: string }) => Change<Invalid | NotFound>
  readonly reorderChapters: (input: { readonly ids: ReadonlyArray<string> }) => Change<never>
  readonly create: (input: typeof CreateInput.Type) => Change<Invalid | NotFound>
  readonly save: (input: typeof SaveInput.Type) => Change<Invalid | NotFound | Conflict | CourseNotReady>
  readonly publish: (input: typeof SaveInput.Type) => Change<Invalid | NotFound | Conflict | CourseNotReady>
  readonly setStatus: (input: typeof SetStatusInput.Type) => Change<NotFound | CourseNotReady>
  readonly duplicate: (input: { readonly id: string }) => Change<NotFound>
  readonly remove: (input: { readonly ids: ReadonlyArray<string> }) => Change<NotFound>
  readonly restore: (input: { readonly ids: ReadonlyArray<string> }) => Change<NotFound>
  readonly reorder: (input: typeof ReorderCoursesInput.Type) => Change<Invalid | NotFound>
  readonly remind: (input: typeof RemindInput.Type) => Change<NotFound | Conflict>
  readonly step: (input: typeof StepInput.Type) => Effect.Effect<StepResult, Invalid | NotFound | CourseNotOpen, R>
  readonly finish: (input: { readonly courseId: string }) => Effect.Effect<FinishResult, Invalid | CourseNotOpen, R>
  readonly retake: (input: { readonly courseId: string }) => Effect.Effect<void, CourseNotOpen, R>
  readonly reset: (input: typeof ResetInput.Type) => Change<NotFound>
  readonly ask: (input: typeof AskInput.Type) => Effect.Effect<CourseChange, Invalid | NotFound | CourseNotOpen, R>
  readonly answer: (input: typeof AnswerInput.Type) => Change<Invalid | NotFound | Conflict>
  /** An image for one of the course's blocks (`PUT /api/courses/:courseId/media`). */
  readonly upload: (input: {
    readonly courseId: string
    readonly name: string
    readonly mime: string
    readonly bytes: Uint8Array
  }) => Effect.Effect<{ readonly id: string }, Forbidden | Invalid | NotFound, R>
  /** Whether the principal may have a file of this course (`GET /api/files/:id`). */
  readonly mayReadFile: (sql: SqlClient.SqlClient, courseId: string) => Effect.Effect<boolean, never, CurrentPrincipal>
}>()("modules/CoursesService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    CoursesService,
    Effect.map(Effect.all([Effect.service(Relay), Effect.service(FileStore)]), ([relay, files]) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(FileStore, files),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: run(Read.list()),
        addChapter: (input) => run(Commands.addChapter(input)),
        renameChapter: (input) => run(Commands.renameChapter(input)),
        addModule: (input) => run(Commands.addModule(input)),
        renameModule: (input) => run(Commands.renameModule(input)),
        reorderChapters: (input) => run(Commands.reorderChapters(input)),
        create: (input) => run(Commands.create(input)),
        save: (input) => run(Commands.save(input)),
        publish: (input) => run(Commands.publish(input)),
        setStatus: (input) => run(Commands.setStatus(input)),
        duplicate: (input) => run(Commands.duplicate(input)),
        remove: (input) => run(Commands.remove(input)),
        restore: (input) => run(Commands.restore(input)),
        reorder: (input) => run(Commands.reorderCourses(input)),
        remind: (input) => run(Commands.remind(input)),
        step: (input) => run(Learn.step(input)),
        finish: (input) => run(Learn.finish(input)),
        retake: (input) => run(Learn.retake(input)),
        reset: (input) => run(Learn.reset(input)),
        ask: (input) => run(Learn.ask(input)),
        answer: (input) => run(Learn.answer(input)),
        upload: (input) => run(Media.upload(input)),
        mayReadFile: (sql, courseId) =>
          Media.mayRead(sql, courseId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
      }
    })
  )
}

/** `Shared.undo` for `courses.restore`. */
export const restore: (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Forbidden | Conflict | SqlError.SqlError, CurrentPrincipal> = Commands.restoreCompensation

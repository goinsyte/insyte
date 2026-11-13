import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Courses as the console reads and changes them (M17 step 4; domain.md §16.2, widgets/05 §8). The vocabularies are the
 * design's (`lib/courses.ts`): a course is chapters → modules → courses, a course a list of blocks. Times are epoch
 * milliseconds; a deadline is a day (`yyyy-mm-dd`) or empty. A learner's quiz blocks carry no correct answer and no
 * explanation until they checked their own; the server scores.
 */

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const Ids = Schema.Array(Id).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Name = Schema.String.check(Schema.isMaxLength(80))

export const TextBlock = Schema.Struct({
  id: Id,
  kind: Schema.Literal("text"),
  title: Schema.String.check(Schema.isMaxLength(200)),
  body: Schema.String.check(Schema.isMaxLength(20_000))
})
export const VideoBlock = Schema.Struct({
  id: Id,
  kind: Schema.Literal("video"),
  title: Schema.String.check(Schema.isMaxLength(200)),
  url: Schema.String.check(Schema.isMaxLength(2000)),
  minutes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(120))
})
export const ImageBlock = Schema.Struct({
  id: Id,
  kind: Schema.Literal("image"),
  title: Schema.String.check(Schema.isMaxLength(200)),
  /** The uploaded file (`files.kind = course_image`); none yet is an empty slot. */
  fileId: Schema.NullOr(Id),
  caption: Schema.String.check(Schema.isMaxLength(500))
})
export const QuizOption = Schema.Struct({ id: Id, text: Schema.String.check(Schema.isMaxLength(500)) })
export const QuizBlock = Schema.Struct({
  id: Id,
  kind: Schema.Literal("quiz"),
  question: Schema.String.check(Schema.isMaxLength(500)),
  /** Fewer than two filled in is a blocker for publishing, not a refusal to save the draft. */
  options: Schema.Array(QuizOption).check(Schema.isMaxLength(6)),
  /** The right option's id; empty in a learner's copy until they checked their answer. */
  correct: Schema.String.check(Schema.isMaxLength(64)),
  explain: Schema.String.check(Schema.isMaxLength(2000))
})
export const Block = Schema.Union([TextBlock, VideoBlock, ImageBlock, QuizBlock])
export type Block = typeof Block.Type
export type Quiz = typeof QuizBlock.Type

export const Audience = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({
    kind: Schema.Literal("some"),
    /** Role ids, never labels. */
    roles: Schema.Array(Id).check(Schema.isMaxLength(50)),
    members: Schema.Array(Id).check(Schema.isMaxLength(500))
  }),
  Schema.Struct({ kind: Schema.Literal("none") })
])
export type Audience = typeof Audience.Type

export const SupplierAccess = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({ kind: Schema.Literal("some"), ids: Schema.Array(Id).check(Schema.isMaxLength(500)) })
])
export type SupplierAccess = typeof SupplierAccess.Type

export const CourseStatus = Schema.Literals(["draft", "live", "archived"])
export type CourseStatus = typeof CourseStatus.Type
export const Badge = Schema.Literals(["star", "shield", "parcel", "chat", "flag", "key"])
export const PassMark = Schema.Literals([50, 60, 70, 80, 90, 100])

/** What the editor saves: the whole course but its status. */
export const CourseInput = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(120)),
  description: Schema.String.check(Schema.isMaxLength(300)),
  chapterId: Id,
  moduleId: Id,
  blocks: Schema.Array(Block).check(Schema.isMaxLength(100)),
  order: Schema.Literals(["free", "fixed"]),
  audience: Audience,
  suppliers: SupplierAccess,
  /** `yyyy-mm-dd`, or empty for none. */
  deadline: Schema.String.check(Schema.isPattern(/^(\d{4}-\d{2}-\d{2})?$/)),
  badge: Badge,
  passMark: PassMark,
  questions: Schema.Boolean
})
export type CourseInput = typeof CourseInput.Type

export class CourseRow extends Schema.Class<CourseRow>("courses/CourseRow")({
  ...CourseInput.fields,
  id: Schema.String,
  status: CourseStatus,
  /** The member who made it; questions go to them. */
  createdBy: Schema.String,
  updatedAt: Schema.Finite,
  publishedAt: Schema.NullOr(Schema.Finite)
}) {}

export const ModuleRow = Schema.Struct({ id: Schema.String, title: Schema.String })
export const ChapterRow = Schema.Struct({ id: Schema.String, title: Schema.String, modules: Schema.Array(ModuleRow) })
export type ChapterRow = typeof ChapterRow.Type

export const ProgressRow = Schema.Struct({
  courseId: Schema.String,
  /** The member (or, with M16, the supplier contact) taking it. */
  principalId: Schema.String,
  done: Schema.Array(Schema.String),
  answers: Schema.Record(Schema.String, Schema.String),
  attempts: Schema.Int,
  score: Schema.NullOr(Schema.Int),
  startedAt: Schema.Finite,
  finishedAt: Schema.NullOr(Schema.Finite)
})
export type ProgressRow = typeof ProgressRow.Type

export const QuestionRow = Schema.Struct({
  id: Schema.String,
  courseId: Schema.String,
  askerId: Schema.String,
  blockId: Schema.NullOr(Schema.String),
  text: Schema.String,
  at: Schema.Finite,
  answer: Schema.NullOr(Schema.String),
  /** Who answered, by name. */
  answeredBy: Schema.NullOr(Schema.String)
})
export type QuestionRow = typeof QuestionRow.Type

/** A teammate as the audience chips, the matrix and the questions name them. */
export const CoursePerson = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  roleId: Schema.String,
  roleLabel: Schema.String
})

/**
 * Everything the courses pages read, as far as the principal may: at Cursussen · Bekijken every course, everyone's
 * progress and every question; below it the live courses that reach them, their own progress and questions, and the
 * answered questions on those courses. The editor's options (roles, suppliers) at Bewerken.
 */
export class CourseCatalogue extends Schema.Class<CourseCatalogue>("courses/CourseCatalogue")({
  chapters: Schema.Array(ChapterRow),
  courses: Schema.Array(CourseRow),
  progress: Schema.Array(ProgressRow),
  questions: Schema.Array(QuestionRow),
  /** The active team (at Bekijken), or the people the visible courses and questions name. */
  people: Schema.Array(CoursePerson),
  roles: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
  suppliers: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  me: Schema.Struct({ id: Schema.String, name: Schema.String, roleId: Schema.String })
}) {}

/* ── commands ──────────────────────────────────────────────────────────────────────────────────── */

export const IdInput = Schema.Struct({ id: Id })
export const IdsInput = Schema.Struct({ ids: Ids })
export const TitleInput = Schema.Struct({ title: Name })
export const RenameInput = Schema.Struct({ id: Id, title: Name })
export const AddModuleInput = Schema.Struct({ chapterId: Id, title: Name })
export const ReorderChaptersInput = Schema.Struct({ ids: Ids })
export const ReorderCoursesInput = Schema.Struct({ moduleId: Id, ids: Ids })

/** "Cursus maken": a name and a place, or a new chapter (with its first module) when there is none yet. */
export const CreateInput = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(120)),
  chapterId: Schema.optional(Id),
  moduleId: Schema.optional(Id),
  newChapterTitle: Schema.optional(Name)
})

export const SaveInput = Schema.Struct({
  id: Id,
  course: CourseInput,
  /** The `updatedAt` the editor started from; another save since then is `Conflict { stale_version }`. */
  expectedUpdatedAt: Schema.optional(Schema.Finite)
})
export const SetStatusInput = Schema.Struct({ ids: Ids, status: CourseStatus })
export const RemindInput = Schema.Struct({ courseId: Id, memberId: Id })

export const StepInput = Schema.Struct({ courseId: Id, blockId: Id, answer: Schema.optional(Id) })
export const CourseIdInput = Schema.Struct({ courseId: Id })
export const ResetInput = Schema.Struct({ courseId: Id, memberId: Id })
export const AskInput = Schema.Struct({
  courseId: Id,
  blockId: Schema.optional(Id),
  text: Schema.String.check(Schema.isMaxLength(2000))
})
export const AnswerInput = Schema.Struct({ id: Id, text: Schema.String.check(Schema.isMaxLength(4000)) })

/** What a change answers: the record it made (a chapter, a course, a question), and its undo. */
export class CourseChange extends Schema.Class<CourseChange>("courses/CourseChange")({
  id: Schema.NullOr(Schema.String),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A block read or answered: for a quiz, the right option and why, now the learner checked theirs. */
export class StepResult extends Schema.Class<StepResult>("courses/StepResult")({
  correct: Schema.NullOr(Schema.String),
  explain: Schema.NullOr(Schema.String)
}) {}

export class FinishResult extends Schema.Class<FinishResult>("courses/FinishResult")({
  score: Schema.Int,
  passed: Schema.Boolean
}) {}

/** Publishing a course that is not ready: what stands in the way, as codes (`title`, `quiz_correct:<block>`, …). */
export class CourseNotReady extends Schema.TaggedError<CourseNotReady>()("CourseNotReady", {
  blockers: Schema.Array(Schema.String)
}) {}

/** The course is not open to the principal: not live, or not for them, or questions are off. */
export class CourseNotOpen extends Schema.TaggedError<CourseNotOpen>()("CourseNotOpen", {
  courseId: Schema.String
}) {}

/* ── what an undo puts back ────────────────────────────────────────────────────────────────────── */

const Snapshot = Schema.Struct({
  id: Schema.String,
  chapterId: Schema.String,
  moduleId: Schema.String,
  position: Schema.Finite,
  title: Schema.String,
  description: Schema.String,
  blocks: Schema.Unknown,
  status: CourseStatus,
  order: Schema.String,
  audience: Schema.Unknown,
  suppliers: Schema.Unknown,
  deadline: Schema.NullOr(Schema.String),
  badge: Schema.String,
  passMark: Schema.Int,
  questions: Schema.Boolean,
  publishedAt: Schema.NullOr(Schema.Finite),
  deletedAt: Schema.NullOr(Schema.Finite)
})
export type Snapshot = typeof Snapshot.Type

const ProgressSnapshot = Schema.Struct({
  courseId: Schema.String,
  principalId: Schema.String,
  done: Schema.Array(Schema.String),
  answers: Schema.Unknown,
  attempts: Schema.Int,
  score: Schema.NullOr(Schema.Int),
  startedAt: Schema.Finite,
  finishedAt: Schema.NullOr(Schema.Finite)
})

export const CoursesRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("courses"), courses: Schema.Array(Snapshot) }),
  Schema.Struct({
    kind: Schema.Literal("created"),
    courses: Schema.Array(Schema.String),
    chapters: Schema.Array(Schema.String),
    modules: Schema.Array(Schema.String)
  }),
  Schema.Struct({
    kind: Schema.Literal("titled"),
    table: Schema.Literals(["chapter", "module"]),
    id: Schema.String,
    title: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("progress"),
    courseId: Schema.String,
    principalId: Schema.String,
    row: Schema.NullOr(ProgressSnapshot)
  }),
  Schema.Struct({ kind: Schema.Literal("asked"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("answered"), id: Schema.String }),
  // "Herinneren": the note waits out the window in the outbox; spending the token cancels it, nothing else.
  Schema.Struct({ kind: Schema.Literal("reminded") })
])
export type CoursesRestore = typeof CoursesRestore.Type

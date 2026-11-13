import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  type Audience,
  type Block,
  CourseChange,
  type CourseInput,
  CourseNotReady,
  CoursesRestore,
  type CourseStatus,
  type CreateInput,
  type ReorderCoursesInput,
  type SaveInput
} from "../domain/Courses.ts"
import { blockersOf, inAudience } from "../domain/Rules.ts"
import { copyImages } from "./media.ts"
import type { Stored } from "./read.ts"
import { audit, change, kick, lockCourses, snapshotOf } from "./shared.ts"

/*
 * The authoring commands (M17 step 4; widgets/05 §8.1–8.2), at Cursussen · Bewerken; deleting at Beheren. Each answers
 * one undo token (`courses.restore`) that puts exactly that back; a reorder is cosmetic and has none. Publishing
 * re-runs the blockers the editor shows and tells the course's audience once the undo window has passed, as
 * "Herinneren" tells one person.
 */

const FIRST_MODULE = "Algemeen"

const titled = (raw: string, field = "title") => {
  const title = raw.trim()
  return title === "" ? Effect.fail(new Invalid({ fields: { [field]: "required" } })) : Effect.succeed(title)
}

const nextPosition = (
  sql: SqlClient.SqlClient,
  table: "course_chapters" | "course_modules" | "courses",
  where = sql`true`
) =>
  Effect.map(
    sql<{ p: number }>`select coalesce(max(position), -1) + 1 as p from ${sql.literal(table)} where ${where}`,
    (rows) => Number(rows[0]?.p ?? 0)
  )

/** A chapter and its first module, on the command's transaction. */
const makeChapter = Effect.fn("CourseChapters.make")(function*(sql: SqlClient.SqlClient, title: string) {
  const principal = yield* CurrentPrincipal
  const chapterId = mintId("cch")
  const moduleId = mintId("cmd")
  yield* sql`insert into course_chapters (id, workspace_id, title, position)
             values (${chapterId}, ${principal.workspaceId}, ${title}, ${yield* nextPosition(sql, "course_chapters")})`
  yield* sql`insert into course_modules (id, workspace_id, chapter_id, title, position)
             values (${moduleId}, ${principal.workspaceId}, ${chapterId}, ${FIRST_MODULE}, 0)`
  yield* audit(sql, "course_chapter.added", chapterId, { title })
  return { chapterId, moduleId }
})

/** "Hoofdstuk toevoegen": a chapter with its first module, "Algemeen". */
export const addChapter = Effect.fn("CourseChapters.add")(function*(input: { readonly title: string }) {
  yield* Policy.require("courses", 2)
  const title = yield* titled(input.title)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const made = yield* makeChapter(sql, title)
      return yield* change(sql, made.chapterId, {
        kind: "created",
        courses: [],
        chapters: [made.chapterId],
        modules: [made.moduleId]
      })
    })
  )
})

const rename = (table: "chapter" | "module") =>
  Effect.fn(table === "chapter" ? "CourseChapters.rename" : "CourseChapters.renameModule")(function*(input: {
    readonly id: string
    readonly title: string
  }) {
    yield* Policy.require("courses", 2)
    const title = yield* titled(input.title)
    const db = yield* Db
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const name = table === "chapter" ? "course_chapters" : "course_modules"
        const [row] = yield* sql<{ title: string }>`
          select title from ${sql.literal(name)} where id = ${input.id} for update`
        if (row === undefined) return yield* new NotFound({ entity: `course_${table}`, id: input.id })
        yield* sql`update ${sql.literal(name)} set title = ${title} where id = ${input.id}`
        yield* audit(sql, `course_${table}.renamed`, input.id, { title: { from: row.title, to: title } })
        return yield* change(sql, input.id, { kind: "titled", table, id: input.id, title: row.title })
      })
    )
  })

export const renameChapter = rename("chapter")
export const renameModule = rename("module")

/** "Module toevoegen": at the end of its chapter. */
export const addModule = Effect.fn("CourseChapters.addModule")(function*(input: {
  readonly chapterId: string
  readonly title: string
}) {
  yield* Policy.require("courses", 2)
  const title = yield* titled(input.title)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [chapter] = yield* sql<{ id: string }>`select id from course_chapters where id = ${input.chapterId}`
      if (chapter === undefined) return yield* new NotFound({ entity: "course_chapter", id: input.chapterId })
      const id = mintId("cmd")
      const position = yield* nextPosition(sql, "course_modules", sql`chapter_id = ${input.chapterId}`)
      yield* sql`insert into course_modules (id, workspace_id, chapter_id, title, position)
                 values (${id}, ${principal.workspaceId}, ${input.chapterId}, ${title}, ${position})`
      yield* audit(sql, "course_module.added", id, { chapterId: input.chapterId, title })
      return yield* change(sql, id, { kind: "created", courses: [], chapters: [], modules: [id] })
    })
  )
})

/** The chapters in this order ("Omhoog", "Omlaag"); the ones not named keep theirs after them. */
export const reorderChapters = Effect.fn("CourseChapters.reorder")(function*(input: {
  readonly ids: ReadonlyArray<string>
}) {
  yield* Policy.require("courses", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      for (const [i, id] of input.ids.entries()) yield* sql`update course_chapters set position = ${i} where id = ${id}`
      yield* audit(sql, "course_chapter.reordered", input.ids[0] ?? "", { ids: input.ids })
      return new CourseChange({ id: null, undo: null })
    })
  )
})

/** A module's courses in this order (a drag in the catalogue). */
export const reorderCourses = Effect.fn("Courses.reorder")(function*(input: typeof ReorderCoursesInput.Type) {
  yield* Policy.require("courses", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* lockCourses(sql, input.ids)
      if (rows.some((r) => r.moduleId !== input.moduleId)) return yield* new Invalid({ fields: { ids: "module" } })
      for (const [i, id] of input.ids.entries()) yield* sql`update courses set position = ${i} where id = ${id}`
      yield* audit(sql, "course.reordered", input.ids[0] ?? "", { moduleId: input.moduleId, ids: input.ids })
      return new CourseChange({ id: null, undo: null })
    })
  )
})

/** The chapter and module a course goes in: they exist, and the module is the chapter's. */
const placeOf = Effect.fn("Courses.place")(function*(sql: SqlClient.SqlClient, chapterId: string, moduleId: string) {
  const [m] = yield* sql<{ chapterId: string }>`select chapter_id from course_modules where id = ${moduleId}`
  if (m === undefined) return yield* new NotFound({ entity: "course_module", id: moduleId })
  if (m.chapterId !== chapterId) return yield* new Invalid({ fields: { moduleId: "chapter" } })
})

/** "Cursus maken": a draft at the end of its module, open to the whole team, as the design starts one. */
export const create = Effect.fn("Courses.create")(function*(input: typeof CreateInput.Type) {
  yield* Policy.require("courses", 2)
  const title = yield* titled(input.title)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      let place: { chapterId: string; moduleId: string; made: boolean }
      if (input.newChapterTitle !== undefined) {
        const made = yield* makeChapter(sql, yield* titled(input.newChapterTitle, "newChapterTitle"))
        place = { ...made, made: true }
      } else if (input.chapterId !== undefined && input.moduleId !== undefined) {
        yield* placeOf(sql, input.chapterId, input.moduleId)
        place = { chapterId: input.chapterId, moduleId: input.moduleId, made: false }
      } else return yield* new Invalid({ fields: { moduleId: "required" } })
      const id = mintId("crs")
      const position = yield* nextPosition(sql, "courses", sql`module_id = ${place.moduleId}`)
      yield* sql`insert into courses (id, workspace_id, chapter_id, module_id, position, title, created_by)
                 values (${id}, ${principal.workspaceId}, ${place.chapterId}, ${place.moduleId}, ${position},
                         ${title}, ${principal.id})`
      yield* audit(sql, "course.created", id, { title, chapterId: place.chapterId, moduleId: place.moduleId })
      return yield* change(sql, id, {
        kind: "created",
        courses: [id],
        chapters: place.made ? [place.chapterId] : [],
        modules: place.made ? [place.moduleId] : []
      })
    })
  )
})

/** Image blocks name files uploaded for this course (`course_image`), or none. */
const checkFiles = Effect.fn("Courses.checkFiles")(function*(
  sql: SqlClient.SqlClient,
  courseId: string,
  blocks: ReadonlyArray<Block>
) {
  const ids = [...new Set(blocks.flatMap((b) => b.kind === "image" && b.fileId !== null ? [b.fileId] : []))]
  if (ids.length === 0) return
  const found = yield* sql<{ id: string }>`
    select id from files where id in ${sql.in(ids)} and kind = 'course_image' and owner_type = 'course'
      and owner_id = ${courseId} and deleted_at is null`
  if (found.length !== ids.length) return yield* new Invalid({ fields: { blocks: "file" } })
})

const ms = (d: Date) => d.getTime()

/** Who a live course is for, among the active team, but the principal. */
const audienceOf = Effect.fn("Courses.audienceOf")(function*(sql: SqlClient.SqlClient, audience: Audience) {
  const principal = yield* CurrentPrincipal
  if (audience.kind === "none") return []
  const team = yield* sql<{ id: string; roleId: string }>`
    select id, role_id from members where deactivated_at is null and removed_at is null`
  return team.filter((m) => m.id !== principal.id && inAudience(audience, m)).map((m) => m.id)
})

/** Telling a course's people once the undo window has passed (published, or "Herinneren"). */
const tell = Effect.fn("Courses.tell")(function*(
  sql: SqlClient.SqlClient,
  courseId: string,
  memberIds: ReadonlyArray<string>,
  reminder: boolean
) {
  const principal = yield* CurrentPrincipal
  if (memberIds.length === 0) return []
  return [
    yield* Outbox.write(sql, principal.workspaceId, {
      type: "course.assigned",
      workspaceId: principal.workspaceId,
      userId: principal.userId ?? "system",
      courseId,
      memberIds,
      reminder,
      by: principal.id
    }, { afterSeconds: UNDO_SECONDS })
  ]
})

const write = (sql: SqlClient.SqlClient, id: string, c: CourseInput) =>
  sql`update courses set
        title = ${c.title.trim()}, description = ${c.description.trim()}, chapter_id = ${c.chapterId},
        module_id = ${c.moduleId}, blocks = ${JSON.stringify(c.blocks)}::jsonb, block_order = ${c.order},
        audience = ${JSON.stringify(c.audience)}::jsonb, supplier_access = ${JSON.stringify(c.suppliers)}::jsonb,
        deadline = ${c.deadline === "" ? null : c.deadline}::date, badge = ${c.badge}, pass_mark = ${c.passMark},
        questions_enabled = ${c.questions}
      where id = ${id}`

const asInput = (c: Stored): CourseInput => ({
  title: c.title,
  description: c.description,
  chapterId: c.chapterId,
  moduleId: c.moduleId,
  blocks: c.blocks,
  order: c.blockOrder,
  audience: c.audience,
  suppliers: c.supplierAccess,
  deadline: c.deadline ?? "",
  badge: c.badge,
  passMark: c.passMark,
  questions: c.questionsEnabled
})

const saving = (publish: boolean) =>
  Effect.fn(publish ? "Courses.publish" : "Courses.save")(function*(input: typeof SaveInput.Type) {
    yield* Policy.require("courses", 2)
    if (publish) {
      const blockers = blockersOf(input.course)
      if (blockers.length > 0) return yield* new CourseNotReady({ blockers })
    }
    const db = yield* Db
    const { answer, outboxIds } = yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const [c] = yield* lockCourses(sql, [input.id])
        if (input.expectedUpdatedAt !== undefined && ms(c!.updatedAt) !== input.expectedUpdatedAt) {
          return yield* new Conflict({ entity: "course", reason: "stale_version" })
        }
        yield* placeOf(sql, input.course.chapterId, input.course.moduleId)
        yield* checkFiles(sql, input.id, input.course.blocks)
        yield* write(sql, input.id, input.course)
        const going = publish && c!.status !== "live"
        if (
          publish
        ) {
          yield* sql`update courses set status = 'live', published_at = coalesce(published_at, now()) where id = ${input.id}`
        }
        yield* audit(sql, publish ? "course.published" : "course.saved", input.id, {
          blocks: input.course.blocks.length,
          ...(publish ? { status: { from: c!.status, to: "live" } } : {})
        })
        const told = going ? yield* tell(sql, input.id, yield* audienceOf(sql, input.course.audience), false) : []
        return {
          answer: yield* change(sql, input.id, { kind: "courses", courses: [snapshotOf(c!)] }, told),
          outboxIds: told
        }
      })
    )
    yield* kick(outboxIds)
    return answer
  })

/** "Wijzigingen opslaan": the editor's whole draft, blockers allowed; a live course changes for everyone. */
export const save = saving(false)
/** "Publiceren" in the editor: the draft saved and live in one, refused while anything stands in the way. */
export const publish = saving(true)

/** Publiceren, Publicatie intrekken, Archiveren, Terugzetten. Live again re-runs the blockers. */
export const setStatus = Effect.fn("Courses.setStatus")(function*(input: {
  readonly ids: ReadonlyArray<string>
  readonly status: CourseStatus
}) {
  yield* Policy.require("courses", 2)
  const db = yield* Db
  const { answer, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* lockCourses(sql, input.ids)
      if (input.status === "live") {
        for (const c of rows) {
          const blockers = blockersOf(asInput(c))
          if (blockers.length > 0) return yield* new CourseNotReady({ blockers })
        }
      }
      const told: Array<string> = []
      for (const c of rows) {
        if (c.status === input.status) continue
        yield* sql`update courses set status = ${input.status},
                     published_at = case when ${input.status} = 'live' then coalesce(published_at, now())
                                         else published_at end
                   where id = ${c.id}`
        yield* audit(
          sql,
          `course.${input.status === "live" ? "published" : input.status === "archived" ? "archived" : "unpublished"}`,
          c.id,
          {
            status: { from: c.status, to: input.status }
          }
        )
        if (input.status === "live") told.push(...(yield* tell(sql, c.id, yield* audienceOf(sql, c.audience), false)))
      }
      return {
        answer: yield* change(sql, rows.length === 1 ? rows[0]!.id : null, {
          kind: "courses",
          courses: rows.map(snapshotOf)
        }, told),
        outboxIds: told
      }
    })
  )
  yield* kick(outboxIds)
  return answer
})

/** "Dupliceren": a draft copy right after it, with the same blocks under new ids. */
export const duplicate = Effect.fn("Courses.duplicate")(function*(input: { readonly id: string }) {
  yield* Policy.require("courses", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* lockCourses(sql, [input.id])
      const [after] = yield* sql<{ p: number | null }>`
        select min(position) as p from courses
        where module_id = ${c!.moduleId} and position > ${c!.position} and deleted_at is null`
      const position = after?.p === null || after?.p === undefined
        ? c!.position + 1
        : (c!.position + Number(after.p)) / 2
      const id = mintId("crs")
      // The copy's images are its own files, so either course can go without the other.
      const copied = yield* copyImages(
        sql,
        id,
        c!.blocks.flatMap((b) => b.kind === "image" && b.fileId !== null ? [b.fileId] : [])
      )
      const blocks = c!.blocks.map((b) => ({
        ...b,
        id: mintId("blk"),
        ...(b.kind === "image" && b.fileId !== null ? { fileId: copied.get(b.fileId) ?? null } : {})
      }))
      const title = `${c!.title} (kopie)`.slice(0, 120)
      yield* sql`insert into courses (id, workspace_id, chapter_id, module_id, position, title, description, blocks,
                                      block_order, audience, supplier_access, deadline, badge, pass_mark,
                                      questions_enabled, created_by)
                 select ${id}, workspace_id, chapter_id, module_id, ${position}, ${title}, description,
                        ${JSON.stringify(blocks)}::jsonb, block_order, audience, supplier_access, deadline, badge,
                        pass_mark, questions_enabled, ${principal.id}
                 from courses where id = ${input.id}`
      yield* audit(sql, "course.duplicated", id, { from: input.id })
      return yield* change(sql, id, { kind: "created", courses: [id], chapters: [], modules: [] })
    })
  )
})

/** "Verwijderen": set aside (soft), with its progress and questions kept, until it is purged. */
export const remove = Effect.fn("Courses.remove")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("courses", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* lockCourses(sql, input.ids)
      yield* sql`update courses set deleted_at = now() where id in ${sql.in(rows.map((r) => r.id))}`
      for (const c of rows) yield* audit(sql, "course.removed", c.id, { title: c.title })
      return yield* change(sql, null, { kind: "courses", courses: rows.map(snapshotOf) })
    })
  )
})

/** A removed course back where it was (the Prullenbak's "Terugzetten"). */
export const restore = Effect.fn("Courses.restore")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("courses", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* lockCourses(sql, input.ids, { deleted: true })
      yield* sql`update courses set deleted_at = null where id in ${sql.in(rows.map((r) => r.id))}`
      for (const c of rows) yield* audit(sql, "course.restored", c.id, { title: c.title })
      return yield* change(sql, null, { kind: "courses", courses: rows.map(snapshotOf) })
    })
  )
})

/** "Herinneren": one teammate who has the live course to do hears of it, once the undo window has passed. */
export const remind = Effect.fn("Courses.remind")(function*(input: {
  readonly courseId: string
  readonly memberId: string
}) {
  yield* Policy.require("courses", 2)
  const db = yield* Db
  const { answer, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* lockCourses(sql, [input.courseId])
      if (c!.status !== "live") return yield* new Conflict({ entity: "course", reason: "not_live" })
      const [m] = yield* sql<{ id: string }>`
        select id from members where id = ${input.memberId} and deactivated_at is null and removed_at is null`
      if (m === undefined) return yield* new NotFound({ entity: "member", id: input.memberId })
      const told = yield* tell(sql, c!.id, [m.id], true)
      yield* audit(sql, "course.reminded", c!.id, { memberId: m.id })
      return { answer: yield* change(sql, c!.id, { kind: "reminded" }, told), outboxIds: told }
    })
  )
  yield* kick(outboxIds)
  return answer
})

/* ── undo ──────────────────────────────────────────────────────────────────────────────────────── */

const decodeRestore = Schema.decodeUnknownEffect(CoursesRestore)

/** `courses.restore`: what a course command changed, put back as it was, on the undo's transaction. */
export const restoreCompensation = Effect.fn("Courses.undo")(function*(sql: SqlClient.SqlClient, raw: unknown) {
  const undo = yield* Effect.orDie(decodeRestore(raw))
  switch (undo.kind) {
    case "courses":
      yield* Policy.require("courses", 2)
      for (const c of undo.courses) {
        yield* sql`update courses set
                     chapter_id = ${c.chapterId}, module_id = ${c.moduleId}, position = ${c.position},
                     title = ${c.title}, description = ${c.description}, blocks = ${JSON.stringify(c.blocks)}::jsonb,
                     status = ${c.status}, block_order = ${c.order}, audience = ${JSON.stringify(c.audience)}::jsonb,
                     supplier_access = ${JSON.stringify(c.suppliers)}::jsonb, deadline = ${c.deadline}::date,
                     badge = ${c.badge}, pass_mark = ${c.passMark}, questions_enabled = ${c.questions},
                     published_at = ${c.publishedAt === null ? null : new Date(c.publishedAt)},
                     deleted_at = ${c.deletedAt === null ? null : new Date(c.deletedAt)}
                   where id = ${c.id}`
        yield* audit(sql, "course.restored", c.id, { undo: true })
      }
      return
    case "created": {
      yield* Policy.require("courses", 2)
      if (undo.courses.length > 0) yield* sql`delete from courses where id in ${sql.in([...undo.courses])}`
      const held = [...undo.modules, ...undo.chapters]
      if (held.length > 0) {
        const [used] = yield* sql<{ n: number }>`
          select count(*)::int as n from courses
          where module_id in ${sql.in([...undo.modules, ""])} or chapter_id in ${sql.in([...undo.chapters, ""])}`
        if ((used?.n ?? 0) > 0) return yield* new Conflict({ entity: "course_chapter", reason: "in_use" })
      }
      if (undo.modules.length > 0) yield* sql`delete from course_modules where id in ${sql.in([...undo.modules])}`
      if (undo.chapters.length > 0) {
        yield* sql`delete from course_chapters where id in ${sql.in([...undo.chapters])}`
      }
      for (const id of [...undo.courses, ...undo.chapters, ...undo.modules]) {
        yield* audit(sql, "course.undone", id)
      }
      return
    }
    case "titled":
      yield* Policy.require("courses", 2)
      yield* sql`update ${sql.literal(undo.table === "chapter" ? "course_chapters" : "course_modules")}
                 set title = ${undo.title} where id = ${undo.id}`
      yield* audit(sql, `course_${undo.table}.renamed`, undo.id, { undo: true })
      return
    case "progress": {
      yield* Policy.require("courses", 3)
      const principal = yield* CurrentPrincipal
      yield* sql`delete from course_progress
                 where course_id = ${undo.courseId} and principal_kind = 'member'
                   and principal_id = ${undo.principalId}`
      const row = undo.row
      if (row !== null) {
        yield* sql`insert into course_progress (workspace_id, course_id, principal_kind, principal_id, done, answers,
                                                attempts, score, started_at, finished_at)
                   values (${principal.workspaceId}, ${row.courseId}, 'member', ${row.principalId}, ${[...row.done]},
                           ${JSON.stringify(row.answers)}::jsonb, ${row.attempts}, ${row.score},
                           ${new Date(row.startedAt)},
                           ${row.finishedAt === null ? null : new Date(row.finishedAt)})`
      }
      yield* audit(sql, "course.progress_restored", undo.courseId, { memberId: undo.principalId })
      return
    }
    case "asked": {
      const principal = yield* CurrentPrincipal
      yield* sql`delete from course_questions where id = ${undo.id} and asker_id = ${principal.id}`
      yield* audit(sql, "course_question.withdrawn", undo.id, undefined, "course_question")
      return
    }
    case "answered":
      yield* Policy.require("courses", 2)
      yield* sql`update course_questions set answer = null, answered_by = null, answered_at = null
                 where id = ${undo.id}`
      yield* audit(sql, "course_question.unanswered", undo.id, undefined, "course_question")
      return
    case "reminded":
      return
  }
})

import { Db } from "@insyte/database/Db"
import { canRole, type Level } from "@insyte/domain/Permissions"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  type Audience,
  type Block,
  type ChapterRow,
  CourseCatalogue,
  CourseRow,
  type CourseStatus,
  type ProgressRow,
  type QuestionRow,
  type SupplierAccess
} from "../domain/Courses.ts"
import { forLearner, inAudience } from "../domain/Rules.ts"

/*
 * `Courses.list` (M17 step 4; api.md §2.33): the catalogue with what the principal may see of progress and questions,
 * in one read the courses pages share. Taking a course needs no level: every member reads the live courses that reach
 * them, their own progress and questions, and the answered questions on those courses. Cursussen · Bekijken reads every
 * course, everyone's progress and every question; Bewerken also the editor's options and the right answers.
 */

/** The principal's level in Cursussen; the owner holds all of it. */
export const levelOf = (p: Principal): Level => {
  const role = { ...p.role, stores: "all" as const }
  return canRole(role, "courses", 3) ? 3 : canRole(role, "courses", 2) ? 2 : canRole(role, "courses", 1) ? 1 : 0
}

export interface Stored {
  readonly id: string
  readonly chapterId: string
  readonly moduleId: string
  readonly position: number
  readonly title: string
  readonly description: string
  readonly blocks: ReadonlyArray<Block>
  readonly status: CourseStatus
  readonly blockOrder: "free" | "fixed"
  readonly audience: Audience
  readonly supplierAccess: SupplierAccess
  readonly deadline: string | null
  readonly badge: CourseRow["badge"]
  readonly passMark: CourseRow["passMark"]
  readonly questionsEnabled: boolean
  readonly createdBy: string
  readonly updatedAt: Date
  readonly publishedAt: Date | null
  readonly deletedAt: Date | null
}

export const COLUMNS = `id, chapter_id, module_id, position, title, description, blocks, status, block_order, audience,
  supplier_access, to_char(deadline, 'YYYY-MM-DD') as deadline, badge, pass_mark, questions_enabled, created_by,
  updated_at, published_at, deleted_at`

export const toRow = (c: Stored, blocks: ReadonlyArray<Block> = c.blocks) =>
  new CourseRow({
    id: c.id,
    title: c.title,
    description: c.description,
    chapterId: c.chapterId,
    moduleId: c.moduleId,
    blocks,
    order: c.blockOrder,
    audience: c.audience,
    suppliers: c.supplierAccess,
    deadline: c.deadline ?? "",
    badge: c.badge,
    passMark: c.passMark,
    questions: c.questionsEnabled,
    status: c.status,
    createdBy: c.createdBy,
    updatedAt: c.updatedAt.getTime(),
    publishedAt: c.publishedAt?.getTime() ?? null
  })

/** A course the principal may take: live, and theirs to take (in its audience, or reading the catalogue). */
export const takes = (p: Principal, c: Pick<Stored, "status" | "deletedAt" | "audience">) =>
  c.status === "live" && c.deletedAt === null &&
  (levelOf(p) >= 1 || inAudience(c.audience, { id: p.id, roleId: p.role.id }))

interface ProgressStored {
  readonly courseId: string
  readonly principalId: string
  readonly done: ReadonlyArray<string>
  readonly answers: Record<string, string>
  readonly attempts: number
  readonly score: number | null
  readonly startedAt: Date
  readonly finishedAt: Date | null
}

export const toProgress = (r: ProgressStored): ProgressRow => ({
  courseId: r.courseId,
  principalId: r.principalId,
  done: [...r.done],
  answers: r.answers,
  attempts: r.attempts,
  score: r.score,
  startedAt: r.startedAt.getTime(),
  finishedAt: r.finishedAt?.getTime() ?? null
})

const people = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string> | "all") =>
  sql<{ id: string; name: string; roleId: string; roleLabel: string }>`
    select m.id, coalesce(nullif(u.name, ''), u.email, '') as name, m.role_id, r.label as role_label
    from members m
    join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
    left join auth."user" u on u.id = m.user_id
    where ${
    ids === "all" ? sql`m.deactivated_at is null and m.removed_at is null` : sql`m.id in ${sql.in([...ids, ""])}`
  }
    order by m.joined_at, m.id`

export const list = Effect.fn("Courses.list")(function*() {
  const principal = yield* CurrentPrincipal
  const level = levelOf(principal)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const chapterRows = yield* sql<{ id: string; title: string }>`
        select id, title from course_chapters order by position, created_at, id`
      const moduleRows = yield* sql<{ id: string; chapterId: string; title: string }>`
        select id, chapter_id, title from course_modules order by position, created_at, id`
      const chapters: Array<ChapterRow> = chapterRows.map((c) => ({
        id: c.id,
        title: c.title,
        modules: moduleRows.filter((m) => m.chapterId === c.id).map((m) => ({ id: m.id, title: m.title }))
      }))
      const stored = yield* sql<Stored>`
        select ${sql.literal(COLUMNS)} from courses where deleted_at is null order by position, created_at, id`
      const visible = level >= 1 ? stored : stored.filter((c) => takes(principal, c))
      const ids = visible.map((c) => c.id)
      const progress = ids.length === 0 ? [] : yield* sql<ProgressStored>`
        select course_id, principal_id, done, answers, attempts, score, started_at, finished_at from course_progress
        where course_id in ${sql.in(ids)} and principal_kind = 'member'
          and ${level >= 1 ? sql`true` : sql`principal_id = ${principal.id}`}`
      const questions = ids.length === 0 ? [] : yield* sql<{
        id: string
        courseId: string
        askerId: string
        blockId: string | null
        text: string
        at: Date
        answer: string | null
        answeredBy: string | null
      }>`
        select id, course_id, asker_id, block_id, text, at, answer, answered_by from course_questions
        where course_id in ${sql.in(ids)} and asker_kind = 'member'
          and ${level >= 1 ? sql`true` : sql`(asker_id = ${principal.id} or answer is not null)`}
        order by at desc, id`
      const mine = (courseId: string) =>
        progress.find((p) => p.courseId === courseId && p.principalId === principal.id)?.answers ?? {}
      const named = level >= 1
        ? "all" as const
        : [
          ...new Set([
            principal.id,
            ...visible.map((c) => c.createdBy),
            ...questions.flatMap((q) => [q.askerId, ...(q.answeredBy === null ? [] : [q.answeredBy])])
          ])
        ]
      const team = yield* people(sql, named)
      // Who answered, by name, also once they left the team.
      const answerers = yield* people(sql, [...new Set(questions.flatMap((q) => q.answeredBy ?? []))])
      const nameOf = (id: string) => [...team, ...answerers].find((m) => m.id === id)?.name ?? ""
      const [me] = yield* people(sql, [principal.id])
      const roles = level >= 2
        ? yield* sql<{ id: string; label: string }>`
            select id, label from roles where deleted_at is null order by kind desc, created_at, id`
        : []
      const suppliers = level >= 2
        ? yield* sql<{ id: string; name: string }>`select id, name from suppliers order by name, id`
        : []
      return new CourseCatalogue({
        chapters,
        courses: visible.map((c) => toRow(c, level >= 2 ? c.blocks : forLearner(c.blocks, mine(c.id)))),
        progress: progress.map(toProgress),
        questions: questions.map((q): QuestionRow => ({
          id: q.id,
          courseId: q.courseId,
          askerId: q.askerId,
          blockId: q.blockId,
          text: q.text,
          at: q.at.getTime(),
          answer: q.answer,
          answeredBy: q.answeredBy === null ? null : nameOf(q.answeredBy)
        })),
        people: team,
        roles,
        suppliers,
        me: { id: principal.id, name: me?.name ?? "", roleId: principal.role.id }
      })
    })
  )
})

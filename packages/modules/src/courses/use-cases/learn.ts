import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  type AnswerInput,
  type AskInput,
  CourseNotOpen,
  FinishResult,
  type ResetInput,
  type StepInput,
  StepResult
} from "../domain/Courses.ts"
import { scoreOf } from "../domain/Rules.ts"
import { COLUMNS, type Stored, takes, toProgress } from "./read.ts"
import { audit, change, kick } from "./shared.ts"

/*
 * Taking a course (M17 step 4; widgets/05 §8.3–8.4): a block read or a question checked, the attempt finished and
 * scored here, a retake; and the questions asked on a course and answered by who authors them. Taking needs no level:
 * the course is live and reaches the principal (or they read the catalogue). A step is not audited (it is a click per
 * block); finishing, retaking and a reset are.
 */

interface Progress {
  readonly done: ReadonlyArray<string>
  readonly answers: Record<string, string>
  readonly attempts: number
  readonly score: number | null
  readonly startedAt: Date
  readonly finishedAt: Date | null
}

/** The live course the principal may take, locked; anything else is `CourseNotOpen`. */
const openCourse = Effect.fn("Courses.open")(function*(sql: SqlClient.SqlClient, courseId: string) {
  const principal = yield* CurrentPrincipal
  const [c] = yield* sql<Stored>`select ${sql.literal(COLUMNS)} from courses where id = ${courseId} for share`
  if (c === undefined || !takes(principal, c)) return yield* new CourseNotOpen({ courseId })
  return c
})

const progressOf = (sql: SqlClient.SqlClient, courseId: string, principalId: string) =>
  Effect.map(
    sql<Progress>`
      select done, answers, attempts, score, started_at, finished_at from course_progress
      where course_id = ${courseId} and principal_kind = 'member' and principal_id = ${principalId} for update`,
    (rows) => rows[0]
  )

/**
 * "Volgende" on a block, or "Controleer" on a question: the block done, and a question's first answer kept. In a fixed
 * order only the next block opens. A finished attempt changes no more until a retake.
 */
export const step = Effect.fn("CourseProgress.step")(function*(input: typeof StepInput.Type) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* openCourse(sql, input.courseId)
      const i = c.blocks.findIndex((b) => b.id === input.blockId)
      const block = c.blocks[i]
      if (block === undefined) return yield* new NotFound({ entity: "course_block", id: input.blockId })
      const p = yield* progressOf(sql, c.id, principal.id)
      const done = new Set(p?.done ?? [])
      const answers = { ...p?.answers }
      if (p?.finishedAt == null) {
        if (c.blockOrder === "fixed" && !c.blocks.slice(0, i).every((b) => done.has(b.id))) {
          return yield* new Invalid({ fields: { blockId: "locked" } })
        }
        if (block.kind === "quiz") {
          if (input.answer === undefined) return yield* new Invalid({ fields: { answer: "required" } })
          if (!block.options.some((o) => o.id === input.answer)) {
            return yield* new Invalid({ fields: { answer: "option" } })
          }
          answers[block.id] ??= input.answer
        }
        done.add(block.id)
        yield* sql`
          insert into course_progress (workspace_id, course_id, principal_kind, principal_id, done, answers)
          values (${principal.workspaceId}, ${c.id}, 'member', ${principal.id}, ${[...done]},
                  ${JSON.stringify(answers)}::jsonb)
          on conflict (course_id, principal_kind, principal_id)
          do update set done = excluded.done, answers = excluded.answers`
      }
      return block.kind === "quiz" && answers[block.id] !== undefined
        ? new StepResult({ correct: block.correct, explain: block.explain })
        : new StepResult({ correct: null, explain: null })
    })
  )
})

/** "Afronden": every block done, the attempt scored here and closed. */
export const finish = Effect.fn("CourseProgress.finish")(function*(input: { readonly courseId: string }) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* openCourse(sql, input.courseId)
      const p = yield* progressOf(sql, c.id, principal.id)
      if (p?.finishedAt != null) {
        return new FinishResult({ score: p.score ?? 0, passed: (p.score ?? 0) >= c.passMark })
      }
      if (p === undefined || !c.blocks.every((b) => p.done.includes(b.id))) {
        return yield* new Invalid({ fields: { blocks: "unfinished" } })
      }
      const score = scoreOf(c.blocks, p.answers)
      yield* sql`update course_progress set score = ${score}, attempts = attempts + 1, finished_at = now()
                 where course_id = ${c.id} and principal_kind = 'member' and principal_id = ${principal.id}`
      yield* audit(sql, "course.finished", c.id, { score, attempt: p.attempts + 1 })
      return new FinishResult({ score, passed: score >= c.passMark })
    })
  )
})

/** "Opnieuw maken": a new attempt from the start; the attempts and the last score stay. */
export const retake = Effect.fn("CourseProgress.retake")(function*(input: { readonly courseId: string }) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* openCourse(sql, input.courseId)
      yield* sql`update course_progress set done = '{}', answers = '{}'::jsonb, finished_at = null, started_at = now()
                 where course_id = ${c.id} and principal_kind = 'member' and principal_id = ${principal.id}`
      yield* audit(sql, "course.retaken", c.id)
    })
  )
})

/** "Voortgang wissen" for a teammate (Beheren): they take it again from the start; undoable. */
export const reset = Effect.fn("CourseProgress.reset")(function*(input: typeof ResetInput.Type) {
  yield* Policy.require("courses", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<{ id: string }>`select id from courses where id = ${input.courseId} and deleted_at is null`
      if (c === undefined) return yield* new NotFound({ entity: "course", id: input.courseId })
      const p = yield* progressOf(sql, c.id, input.memberId)
      if (p === undefined) return yield* new NotFound({ entity: "course_progress", id: input.memberId })
      yield* sql`delete from course_progress
                 where course_id = ${c.id} and principal_kind = 'member' and principal_id = ${input.memberId}`
      yield* audit(sql, "course.progress_reset", c.id, { memberId: input.memberId })
      return yield* change(sql, c.id, {
        kind: "progress",
        courseId: c.id,
        principalId: input.memberId,
        row: toProgress({ courseId: c.id, principalId: input.memberId, ...p })
      })
    })
  )
})

/** "Stel een vraag" on a course whose questions are on; its maker hears of it once the undo window has passed. */
export const ask = Effect.fn("CourseQuestions.ask")(function*(input: typeof AskInput.Type) {
  const principal = yield* CurrentPrincipal
  const text = input.text.trim()
  if (text === "") return yield* new Invalid({ fields: { text: "required" } })
  const db = yield* Db
  const { answer, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* openCourse(sql, input.courseId)
      if (!c.questionsEnabled) return yield* new CourseNotOpen({ courseId: c.id })
      if (input.blockId !== undefined && !c.blocks.some((b) => b.id === input.blockId)) {
        return yield* new NotFound({ entity: "course_block", id: input.blockId })
      }
      const id = mintId("cqs")
      yield* sql`insert into course_questions (id, workspace_id, course_id, block_id, asker_kind, asker_id, text)
                 values (${id}, ${principal.workspaceId}, ${c.id}, ${input.blockId ?? null}, 'member', ${principal.id},
                         ${text})`
      yield* audit(sql, "course_question.asked", id, { courseId: c.id }, "course_question")
      const told = [
        yield* Outbox.write(sql, principal.workspaceId, {
          type: "course.question",
          workspaceId: principal.workspaceId,
          userId: principal.userId ?? "system",
          questionId: id,
          by: principal.id
        }, { afterSeconds: UNDO_SECONDS })
      ]
      return { answer: yield* change(sql, id, { kind: "asked", id }, told), outboxIds: told }
    })
  )
  yield* kick(outboxIds)
  return answer
})

/** "Beantwoorden" (Bewerken): once; the asker hears of it once the undo window has passed. */
export const answer = Effect.fn("CourseQuestions.answer")(function*(input: typeof AnswerInput.Type) {
  yield* Policy.require("courses", 2)
  const principal = yield* CurrentPrincipal
  const text = input.text.trim()
  if (text === "") return yield* new Invalid({ fields: { text: "required" } })
  const db = yield* Db
  const { answer: said, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [q] = yield* sql<{ answer: string | null }>`
        select q.answer from course_questions q join courses c on c.id = q.course_id
        where q.id = ${input.id} and c.deleted_at is null for update of q`
      if (q === undefined) return yield* new NotFound({ entity: "course_question", id: input.id })
      if (q.answer !== null) return yield* new Conflict({ entity: "course_question", reason: "answered" })
      yield* sql`update course_questions set answer = ${text}, answered_by = ${principal.id}, answered_at = now()
                 where id = ${input.id}`
      yield* audit(sql, "course_question.answered", input.id, undefined, "course_question")
      const told = [
        yield* Outbox.write(sql, principal.workspaceId, {
          type: "course.answered",
          workspaceId: principal.workspaceId,
          userId: principal.userId ?? "system",
          questionId: input.id,
          by: principal.id
        }, { afterSeconds: UNDO_SECONDS })
      ]
      return { answer: yield* change(sql, input.id, { kind: "answered", id: input.id }, told), outboxIds: told }
    })
  )
  yield* kick(outboxIds)
  return said
})

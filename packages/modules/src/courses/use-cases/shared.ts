import { NotFound } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { CourseChange, type CoursesRestore } from "../domain/Courses.ts"
import { COLUMNS, type Stored } from "./read.ts"

/* What the course commands share: the audit line, the undo token, the relay's kick and the course row, locked. */

export const RESTORE = "courses.restore"

export const audit = (
  sql: SqlClient.SqlClient,
  action: string,
  subjectId: string,
  diff?: Record<string, unknown>,
  subjectType: "course" | "course_question" = "course"
) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) => Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, { action, subjectType, subjectId, diff })
  )

export const change = (
  sql: SqlClient.SqlClient,
  id: string | null,
  restore: CoursesRestore,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.map(
    Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds }),
    (undo) => new CourseChange({ id, undo })
  )

export const kick = (outboxIds: ReadonlyArray<string>) =>
  outboxIds.length === 0
    ? Effect.void
    : Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS }))

/** The courses by id, not deleted unless asked, locked for the command; one missing is `NotFound`. */
export const lockCourses = Effect.fn("Courses.lock")(function*(
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>,
  options: { readonly deleted?: boolean } = {}
) {
  const wanted = [...new Set(ids)]
  const rows = yield* sql<Stored>`
    select ${sql.literal(COLUMNS)} from courses
    where id in ${sql.in(wanted)} and ${
    options.deleted === true ? sql`deleted_at is not null` : sql`deleted_at is null`
  }
    order by id for update`
  const missing = wanted.find((id) => !rows.some((r) => r.id === id))
  if (missing !== undefined) return yield* new NotFound({ entity: "course", id: missing })
  return wanted.map((id) => rows.find((r) => r.id === id)!)
})

export const snapshotOf = (c: Stored) => ({
  id: c.id,
  chapterId: c.chapterId,
  moduleId: c.moduleId,
  position: c.position,
  title: c.title,
  description: c.description,
  blocks: c.blocks,
  status: c.status,
  order: c.blockOrder,
  audience: c.audience,
  suppliers: c.supplierAccess,
  deadline: c.deadline,
  badge: c.badge,
  passMark: c.passMark,
  questions: c.questionsEnabled,
  publishedAt: c.publishedAt?.getTime() ?? null,
  deletedAt: c.deletedAt?.getTime() ?? null
})

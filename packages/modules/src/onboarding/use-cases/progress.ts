import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Effect, Schema } from "effect"
import { Answers, OnboardingState } from "../domain/Onboarding.ts"
import { type Facts, next, positionOf, Step, Track } from "../domain/Steps.ts"

/*
 * The person's progress row, read and written as that person (`Db.forUser`, user-scoped RLS). Before a workspace there
 * is one open row per person; the organisation step fills in its workspace, and finishing the track closes it.
 */

const Row = Schema.Struct({ track: Track, step: Step, answers: Answers, workspaceId: Schema.NullOr(Schema.String) })
export type Row = typeof Row.Type

/** What the machine knows about this person and their progress today. Stores and backfills join with M6. */
export const factsOf = (user: SessionUser, row: Pick<Row, "workspaceId">): Facts => ({
  emailVerified: user.emailVerified,
  hasWorkspace: row.workspaceId !== null,
  storeConnected: false,
  backfillDone: false
})

export const stateOf = (row: Row): OnboardingState =>
  new OnboardingState({ track: row.track, step: row.step, answers: row.answers, ...positionOf(row.track, row.step) })

const decodeRow = Schema.decodeUnknownEffect(Row)

/** The open row, created on first read: a signed-in person has an account, so they start past `account`. */
export const loadProgress = Effect.fn("Onboarding.loadProgress")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const select = (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) =>
    sql`select track, step, answers, workspace_id from onboarding_progress
        where completed_at is null order by started_at limit 1`
  const found = yield* db.forUser((sql) =>
    Effect.gen(function*() {
      const rows = yield* select(sql)
      if (rows.length > 0) return rows[0]
      yield* sql`insert into onboarding_progress (id, user_id, track, step)
                 values (${mintId("onb")}, ${user.id}, 'admin', ${
        next("admin", "account", factsOf(user, { workspaceId: null }))
      })
                 on conflict do nothing`
      return (yield* select(sql))[0]
    })
  )
  return yield* decodeRow(found)
})

export const saveProgress = Effect.fn("Onboarding.saveProgress")(function*(row: Row) {
  const db = yield* Db
  yield* db.forUser((sql) =>
    sql`update onboarding_progress
        set track = ${row.track}, step = ${row.step}, answers = ${JSON.stringify(row.answers)}::jsonb
        where completed_at is null`
  )
})

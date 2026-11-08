import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Effect, Schema } from "effect"
import { Answers, OnboardingState } from "../domain/Onboarding.ts"
import { type Facts, next, positionOf, Step, Track } from "../domain/Steps.ts"

/*
 * The person's progress row, read and written as that person (`Db.forUser`, user-scoped RLS). Before a workspace there
 * is one open row per person; the organisation step fills in its workspace, and finishing the track closes it. A closed
 * row is still the person's answer: they are done, not starting over.
 */

const Row = Schema.Struct({
  track: Track,
  step: Step,
  answers: Answers,
  workspaceId: Schema.NullOr(Schema.String),
  completed: Schema.Boolean
})
export type Row = typeof Row.Type

/** The workspace's store, as the machine needs it: connected (or importing), and whether its first import is in. */
export interface StoreFacts {
  readonly connected: boolean
  readonly synced: boolean
}

const NO_STORE: StoreFacts = { connected: false, synced: false }

/** What the machine knows about this person and their progress today. */
export const factsOf = (user: SessionUser, row: Pick<Row, "workspaceId">, store: StoreFacts = NO_STORE): Facts => ({
  emailVerified: user.emailVerified,
  hasWorkspace: row.workspaceId !== null,
  storeConnected: store.connected,
  backfillDone: store.synced
})

/** The workspace's store facts, read inside it as the person (the stores table is the workspace's). */
export const storeFactsOf = Effect.fn("Onboarding.storeFacts")(function*(workspaceId: WorkspaceId | null) {
  if (workspaceId === null) return NO_STORE
  const db = yield* Db
  const [row] = yield* db.asUserIn(workspaceId)((sql) =>
    sql<StoreFacts>`
      select exists (select 1 from stores where status in ('connecting', 'connected')) as connected,
             exists (select 1 from stores where status = 'connected' and last_synced_at is not null) as synced`
  )
  return row ?? NO_STORE
})

export const stateOf = (row: Row): OnboardingState =>
  new OnboardingState({
    track: row.track,
    step: row.step,
    answers: row.answers,
    ...positionOf(row.track, row.step),
    completed: row.completed
  })

const decodeRow = Schema.decodeUnknownEffect(Row)

/**
 * The open row, else the last finished one; created on first read: a signed-in person has an account, so they start
 * past `account`.
 */
export const loadProgress = Effect.fn("Onboarding.loadProgress")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const select = (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) =>
    sql`select track, step, answers, workspace_id, completed_at is not null as completed from onboarding_progress
        order by completed_at desc nulls first, started_at limit 1`
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

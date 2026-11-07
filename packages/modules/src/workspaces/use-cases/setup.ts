import type { UserId, WorkspaceId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { type PlanId, TRIAL_DAYS } from "../../shared/domain/Billing.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"

/*
 * Onboarding's later steps on the workspace (M4.1), on the caller's transaction inside it: the trial on the chosen plan,
 * and the end of onboarding. Each is audited as the person's membership in the workspace.
 */

const memberOf = Effect.fn("Workspaces.memberOf")(function*(id: WorkspaceId, user: UserId) {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ id: string }>`select id from members where workspace_id = ${id} and user_id = ${user}`
  if (row === undefined) return yield* Effect.die(`${user} is not a member of ${id}`)
  return { kind: "member" as const, id: row.id }
})

export const startTrial = Effect.fn("Workspaces.startTrial")(function*(id: WorkspaceId, plan: PlanId, by: UserId) {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ trialEndsAt: Date }>`
    update workspaces set plan = ${plan}, trial_ends_at = now() + make_interval(days => ${TRIAL_DAYS})
    where id = ${id} returning trial_ends_at`
  yield* Audit.write(sql, id, yield* memberOf(id, by), {
    action: "workspace.trial_started",
    subjectType: "workspace",
    subjectId: id,
    diff: { plan, trialEndsAt: row?.trialEndsAt.toISOString() }
  })
})

export const completeOnboarding = Effect.fn("Workspaces.completeOnboarding")(function*(id: WorkspaceId, by: UserId) {
  const sql = yield* SqlClient.SqlClient
  yield* sql`update workspaces set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = ${id}`
  yield* Audit.write(sql, id, yield* memberOf(id, by), {
    action: "workspace.onboarding_completed",
    subjectType: "workspace",
    subjectId: id
  })
})

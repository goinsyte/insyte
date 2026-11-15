import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser, Switched } from "@insyte/domain/Session"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { type CreateWorkspaceInput, validateWorkspace, WorkspaceFounder } from "../../shared/domain/Workspaces.ts"
import { activate } from "../../shared/use-cases/ActiveWorkspace.ts"
import { NotCurrentStep } from "../domain/Onboarding.ts"
import { next } from "../domain/Steps.ts"
import { factsOf, loadProgress } from "./progress.ts"

/**
 * `Workspaces.create` (M3.1): "Nieuwe werkruimte" in the switcher, for someone whose own onboarding is done. The
 * workspace is founded as onboarding's organisation step founds it (the `WorkspaceFounder` port: its five system roles,
 * the person as its owner, its counters, audited, `workspace.created` in the outbox), with a new onboarding row for it
 * on the step after (`plan`), and the session goes on in it, all in one transaction. The console then opens onboarding,
 * which resumes on that row: the plan step starts the trial exactly as it does at sign-up, and the rest of the track
 * follows. Someone still in their first onboarding founds there instead (`NotCurrentStep`).
 */
export const another = Effect.fn("Onboarding.another")(function*(input: CreateWorkspaceInput, sessionId: string) {
  const user = yield* CurrentUser
  const current = yield* loadProgress()
  if (!current.completed) return yield* new NotCurrentStep({ step: "organization", current: current.step })
  const checked = validateWorkspace(input)
  if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
  const founder = yield* WorkspaceFounder
  const db = yield* Db
  const workspaceId = mintId("ws") as WorkspaceId
  const step = next("admin", "organization", factsOf(user, { workspaceId }))
  const outboxIds = yield* db.asUserIn(workspaceId)((sql) =>
    Effect.gen(function*() {
      const written = yield* founder.found(workspaceId, checked.ok, user.id)
      yield* sql`insert into onboarding_progress (id, user_id, workspace_id, track, step, answers)
                 values (${mintId("onb")}, ${user.id}, ${workspaceId}, 'admin', ${step},
                         ${JSON.stringify({ persona: "admin" })}::jsonb)`
      yield* activate(sql, { id: sessionId, userId: user.id }, workspaceId)
      return written
    }).pipe(Effect.provideService(SqlClient.SqlClient, sql))
  )
  yield* (yield* Relay).kick(outboxIds)
  return new Switched({ workspaceId, landing: "/onboarding" })
})

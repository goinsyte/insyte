import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { validateWorkspace, WorkspaceFounder } from "../../shared/domain/Workspaces.ts"
import { type AdvanceInput, NotCurrentStep } from "../domain/Onboarding.ts"
import { next } from "../domain/Steps.ts"
import { me } from "./me.ts"
import { factsOf, loadProgress, saveProgress, stateOf } from "./progress.ts"

/**
 * `Onboarding.advance`: finishes the current step with its answers, and moves to the next. `role` stores the persona
 * and with it the track. `organization` founds the workspace (the `WorkspaceFounder` port) and moves on, in one
 * transaction as the person inside the new workspace: both commit, or neither.
 */
export const advance = Effect.fn("Onboarding.advance")(function*(input: AdvanceInput) {
  const user = yield* CurrentUser
  const current = yield* me()
  if (input.step !== current.step) return yield* new NotCurrentStep({ step: input.step, current: current.step })

  if (input.step === "organization") {
    const checked = validateWorkspace(input)
    if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
    const founder = yield* WorkspaceFounder
    const db = yield* Db
    const workspaceId = mintId("ws") as WorkspaceId
    const row = yield* loadProgress()
    const moved = { ...row, workspaceId, step: next(row.track, "organization", factsOf(user, { workspaceId })) }
    yield* db.asUserIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        yield* founder.found(workspaceId, checked.ok, user.id)
        yield* sql`update onboarding_progress set workspace_id = ${workspaceId}, step = ${moved.step}
                   where completed_at is null`
      }).pipe(Effect.provideService(SqlClient.SqlClient, sql))
    )
    return stateOf(moved)
  }

  const row = yield* loadProgress()
  const track = input.step === "role" ? input.persona : row.track
  const answers = input.step === "role" ? { ...row.answers, persona: input.persona } : row.answers
  const moved = { ...row, track, answers, step: next(track, input.step, factsOf(user, row)) }
  yield* saveProgress(moved)
  return stateOf(moved)
})

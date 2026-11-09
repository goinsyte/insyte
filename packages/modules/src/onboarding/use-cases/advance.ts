import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { validateWorkspace, WorkspaceFounder, WorkspaceSetup } from "../../shared/domain/Workspaces.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type AdvanceInput, NotCurrentStep, StepNotReady } from "../domain/Onboarding.ts"
import { next } from "../domain/Steps.ts"
import { me } from "./me.ts"
import { factsOf, loadProgress, type Row, saveProgress, stateOf, storeFactsOf } from "./progress.ts"

/**
 * `Onboarding.advance`: finishes the current step with its answers, and moves to the next. `role` stores the persona
 * and with it the track. `organization` founds the workspace (the `WorkspaceFounder` port) and moves on, in one
 * transaction as the person inside the new workspace: both commit, or neither; then the relay delivers its events. The
 * steps after it run the same way inside that workspace: `plan` starts the trial, `store` leaves the store for the Start
 * checklist or, connected, ticks it and goes on to `sync`, which passes once the first import is in; `analysis`
 * follows it (its choices are kept by `FirstAnalysis.prepare`, M6.5) and goes on to ready; `ready` ends
 * onboarding (`WorkspaceSetup`). A finished track answers as it is: a replayed `ready` changes
 * nothing.
 */
export const advance = Effect.fn("Onboarding.advance")(function*(input: AdvanceInput) {
  const user = yield* CurrentUser
  const current = yield* me()
  if (current.completed) return current
  if (input.step !== current.step) return yield* new NotCurrentStep({ step: input.step, current: current.step })

  if (input.step === "organization") {
    const checked = validateWorkspace(input)
    if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
    const founder = yield* WorkspaceFounder
    const db = yield* Db
    const workspaceId = mintId("ws") as WorkspaceId
    const row = yield* loadProgress()
    const moved = { ...row, workspaceId, step: next(row.track, "organization", factsOf(user, { workspaceId })) }
    const outboxIds = yield* db.asUserIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        const written = yield* founder.found(workspaceId, checked.ok, user.id)
        yield* sql`update onboarding_progress set workspace_id = ${workspaceId}, step = ${moved.step}
                   where completed_at is null`
        return written
      }).pipe(Effect.provideService(SqlClient.SqlClient, sql))
    )
    // Committed: deliver its events now (the minute sweep catches anything this misses).
    yield* (yield* Relay).kick(outboxIds)
    return stateOf(moved)
  }

  const row = yield* loadProgress()
  if (
    input.step === "plan" || input.step === "store" || input.step === "sync" || input.step === "analysis" ||
    input.step === "ready"
  ) {
    // Past the organisation step there is a workspace: `next` holds anyone without one there.
    if (row.workspaceId === null) return yield* new NotCurrentStep({ step: input.step, current: "organization" })
    const workspaceId = row.workspaceId as WorkspaceId
    const store = yield* storeFactsOf(workspaceId)
    const connected = input.step === "store" && input.choice === "connected"
    if (connected && !store.connected) return yield* new StepNotReady({ step: "store", missing: "store" })
    if (input.step === "sync" && !store.synced) return yield* new StepNotReady({ step: "sync", missing: "import" })
    // "Nu overslaan" with a store connected meanwhile still skips what follows a store.
    const facts = factsOf(user, row, input.step === "store" && !connected ? { connected: false, synced: false } : store)
    const setup = yield* WorkspaceSetup
    const db = yield* Db
    const answers = input.step === "plan"
      ? { ...row.answers, plan: input.plan, cycle: input.cycle }
      : input.step === "store"
      ? { ...row.answers, store: input.choice }
      : row.answers
    const done = input.step === "ready"
    const moved: Row = { ...row, answers, step: next(row.track, input.step, facts), completed: done }
    const outboxIds = yield* db.asUserIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        if (input.step === "plan") yield* setup.startTrial(workspaceId, input.plan, user.id)
        if (input.step === "store") {
          // Connected, the task is done; left for later, it waits on the Start checklist.
          yield* sql`insert into setup_tasks (workspace_id, task, done_at, done_by)
                     values (${workspaceId}, 'store', case when ${connected} then now() end,
                             ${connected ? user.id : null})
                     on conflict (workspace_id, task) do update set done_at = excluded.done_at, done_by = excluded.done_by`
        }
        if (done) yield* setup.completeOnboarding(workspaceId, user.id)
        yield* sql`update onboarding_progress
                   set step = ${moved.step}, answers = ${JSON.stringify(answers)}::jsonb,
                       completed_at = case when ${done} then now() end
                   where completed_at is null`
        return [
          yield* Outbox.write(sql, workspaceId, {
            type: "onboarding.step_completed",
            workspaceId,
            userId: user.id,
            step: input.step
          })
        ]
      }).pipe(Effect.provideService(SqlClient.SqlClient, sql))
    )
    yield* (yield* Relay).kick(outboxIds)
    return stateOf(moved)
  }

  const track = input.step === "role" ? input.persona : row.track
  const answers = input.step === "role" ? { ...row.answers, persona: input.persona } : row.answers
  const moved = { ...row, track, answers, step: next(track, input.step, factsOf(user, row)) }
  yield* saveProgress(moved)
  return stateOf(moved)
})

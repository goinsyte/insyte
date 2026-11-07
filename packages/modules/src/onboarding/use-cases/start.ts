import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { type CompleteTaskInput, NotCurrentStep, type SetupTask, StartChecklist } from "../domain/Onboarding.ts"
import { loadProgress } from "./progress.ts"

/*
 * Start's first-run page (M4.1): the workspace onboarding founded and how far its setup is, read inside it as the
 * person. `team` is done once someone else has joined; a store (M6) and an inbox (M11) are not connectable yet, so those
 * two stay open. The rest are the operator's word, in `setup_tasks`.
 */

/** The workspace this person's onboarding founded; only someone past the organisation step has one. */
const workspaceOf = Effect.fn("Onboarding.workspaceOf")(function*() {
  const row = yield* loadProgress()
  if (row.workspaceId === null) return yield* new NotCurrentStep({ step: "ready", current: row.step })
  return row.workspaceId as WorkspaceId
})

export const start = Effect.fn("Onboarding.start")(function*() {
  const workspaceId = yield* workspaceOf()
  const db = yield* Db
  return yield* db.asUserIn(workspaceId)((sql) =>
    Effect.gen(function*() {
      const [workspace] = yield* sql<{ name: string; members: string }>`
        select w.name, (select count(*) from members m where m.workspace_id = w.id and m.deactivated_at is null)::text
               as members
        from workspaces w where w.id = ${workspaceId}`
      const ticked = yield* sql<{ task: SetupTask }>`
        select task from setup_tasks where done_at is not null and dismissed_at is null`
      const done: Array<SetupTask> = Number(workspace?.members ?? 0) > 1 ? ["team"] : []
      for (const { task } of ticked) if (task !== "store" && task !== "inbox" && task !== "team") done.push(task)
      return new StartChecklist({ workspaceName: workspace?.name ?? "", done })
    })
  )
})

/** Ticks a task the operator does themselves, or takes the tick back. */
export const completeTask = Effect.fn("Onboarding.completeTask")(function*(input: CompleteTaskInput) {
  const user = yield* CurrentUser
  const workspaceId = yield* workspaceOf()
  const db = yield* Db
  yield* db.asUserIn(workspaceId)((sql) =>
    sql`insert into setup_tasks (workspace_id, task, done_at, done_by)
        values (${workspaceId}, ${input.task}, case when ${input.done} then now() end, ${input.done ? user.id : null})
        on conflict (workspace_id, task) do update set done_at = excluded.done_at, done_by = excluded.done_by`
  )
  return yield* start()
})

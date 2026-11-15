import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { type CompleteTaskInput, NotCurrentStep, type SetupTask, StartChecklist } from "../domain/Onboarding.ts"
import { loadProgress } from "./progress.ts"

/*
 * Start's first-run page (M4.1): the workspace onboarding founded and how far its setup is, read inside it as the
 * person. `team` is done once someone else has joined, `store` once a store is connected (M6.2); an inbox (M11) is not
 * connectable yet, so it stays open. The rest are the operator's word, in `setup_tasks`.
 */

/**
 * The workspace whose checklist this is: the one the session acts in (`active`), where this person's onboarding
 * founded it; else, with no workspace chosen, the one their onboarding founded. Someone who did not found the active
 * workspace (they joined it) has no checklist there, and never sees another workspace's.
 */
const workspaceOf = Effect.fn("Onboarding.workspaceOf")(function*(active: WorkspaceId | null) {
  const row = yield* loadProgress()
  if (active !== null) {
    const db = yield* Db
    const founded = yield* db.forUser((sql) =>
      sql<{ workspaceId: string }>`select workspace_id from onboarding_progress where workspace_id = ${active}`
    )
    if (founded.length === 0) return yield* new NotCurrentStep({ step: "ready", current: row.step })
    return active
  }
  if (row.workspaceId === null) return yield* new NotCurrentStep({ step: "ready", current: row.step })
  return row.workspaceId as WorkspaceId
})

export const start = Effect.fn("Onboarding.start")(function*(active: WorkspaceId | null) {
  const workspaceId = yield* workspaceOf(active)
  const db = yield* Db
  return yield* db.asUserIn(workspaceId)((sql) =>
    Effect.gen(function*() {
      const [workspace] = yield* sql<{ name: string; members: string }>`
        select w.name, (select count(*) from members m where m.workspace_id = w.id and m.deactivated_at is null)::text
               as members
        from workspaces w where w.id = ${workspaceId}`
      const ticked = yield* sql<{ task: SetupTask }>`
        select task from setup_tasks where done_at is not null and dismissed_at is null`
      const [store] = yield* sql<{ connected: boolean }>`
        select exists (select 1 from stores where status <> 'disconnected') as connected`
      const done: Array<SetupTask> = Number(workspace?.members ?? 0) > 1 ? ["team"] : []
      if (store?.connected === true) done.push("store")
      for (const { task } of ticked) if (task !== "store" && task !== "inbox" && task !== "team") done.push(task)
      return new StartChecklist({ workspaceName: workspace?.name ?? "", done })
    })
  )
})

/** Ticks a task the operator does themselves, or takes the tick back. */
export const completeTask = Effect.fn("Onboarding.completeTask")(
  function*(input: CompleteTaskInput, active: WorkspaceId | null) {
    const user = yield* CurrentUser
    const workspaceId = yield* workspaceOf(active)
    const db = yield* Db
    yield* db.asUserIn(workspaceId)((sql) =>
      sql`insert into setup_tasks (workspace_id, task, done_at, done_by)
        values (${workspaceId}, ${input.task}, case when ${input.done} then now() end, ${input.done ? user.id : null})
        on conflict (workspace_id, task) do update set done_at = excluded.done_at, done_by = excluded.done_by`
    )
    return yield* start(workspaceId)
  }
)

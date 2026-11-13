import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { AiBudgets, BudgetInvalid, type BudgetRestore, BudgetsSaved, type SetBudgetsInput } from "../domain/Autonomy.ts"

/*
 * Limieten (M15 step 6; domain.md §9.6): what Insyte AI may cost a month, for the workspace and per person, in whole
 * euros. Read by the whole team, changed with `ai.autonomy`; one save has one undo. What was used is the month's model
 * calls (`model_calls`, M15 step 1) in euros, each at its day's rate (`ai_month_used`): the workspace's, each person's,
 * and the background's (calls without a person). A workspace limit reached makes every agent action ask first
 * (`autonomy_decide`), and refuses every model call until the month turns.
 */

export const RESTORE = "ai_budgets.restore"

type Entry = { readonly scope: string; readonly limit: number | null }

const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

const euros = (minor: string | number | null) => (minor === null ? null : Math.round(Number(minor) / 100))

/** Euro micros as euros, to the cent. */
const spent = (micros: string | number | null | undefined) => Math.round(Number(micros ?? 0) / 10_000) / 100

const read = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const rows = yield* sql<{ memberId: string | null; limitMinor: string | null }>`
      select member_id, monthly_limit_minor as limit_minor from ai_budgets`
    const people = yield* sql<{ id: string }>`
      select id from members where deactivated_at is null and removed_at is null order by joined_at, id`
    const byMember = new Map(rows.filter((r) => r.memberId !== null).map((r) => [r.memberId!, euros(r.limitMinor)]))
    const workspace = rows.find((r) => r.memberId === null)
    const [total] = yield* sql<{ used: string }>`select ai_month_used(null) as used`
    const use = yield* sql<{ memberId: string; used: string }>`
      select id as member_id, ai_month_used(id) as used from members
      where id in (select distinct member_id from model_calls
                   where member_id is not null and created_at >= now() - interval '32 days')`
    const usedBy = new Map(use.map((u) => [u.memberId, spent(u.used)]))
    const all = spent(total?.used)
    const byPeople = [...usedBy.values()].reduce((a, b) => a + b, 0)
    return new AiBudgets({
      month: monthOf(new Date()),
      workspace: { limit: euros(workspace?.limitMinor ?? null), used: all },
      background: Math.max(0, Math.round((all - byPeople) * 100) / 100),
      people: people.map((p) => ({ memberId: p.id, limit: byMember.get(p.id) ?? null, used: usedBy.get(p.id) ?? 0 })),
      metered: true
    })
  })

/** Read by the whole team, as the Limieten page shows it. */
export const get = Effect.fn("AiBudget.get")(function*(sql: SqlClient.SqlClient) {
  return yield* read(sql)
})

const snapshot = (budgets: AiBudgets, scopes: ReadonlyArray<string>): Array<Entry> =>
  scopes.map((scope) => ({
    scope,
    limit: scope === "workspace"
      ? budgets.workspace.limit
      : budgets.people.find((p) => p.memberId === scope)?.limit ?? null
  }))

const apply = Effect.fn("AiBudget.apply")(function*(sql: SqlClient.SqlClient, entries: ReadonlyArray<Entry>) {
  const principal = yield* CurrentPrincipal
  for (const e of entries) {
    const member = e.scope === "workspace" ? null : e.scope
    const minor = e.limit === null ? null : e.limit * 100
    yield* sql`insert into ai_budgets (id, workspace_id, member_id, monthly_limit_minor, updated_by)
               values (${mintId("aib")}, app_workspace_id(), ${member}, ${minor}, ${principal.id})
               on conflict (workspace_id, (coalesce(member_id, ''))) do update
                 set monthly_limit_minor = excluded.monthly_limit_minor, updated_by = excluded.updated_by,
                     updated_at = now(), warned_at = null, reached_at = null`
  }
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: "ai_budget.changed",
    subjectType: "ai_budget",
    subjectId: principal.workspaceId,
    diff: { entries }
  })
})

/** Sets the limits named (`workspace` or a member's id; `null` is no limit); one undo puts them all back. */
export const setMany = Effect.fn("AiBudget.setMany")(function*(sql: SqlClient.SqlClient, input: SetBudgetsInput) {
  yield* Policy.requireAction("ai.autonomy")
  const negative = input.entries.find((e) => e.limit !== null && (e.limit < 0 || !Number.isInteger(e.limit)))
  if (negative !== undefined) return yield* new BudgetInvalid({ scope: negative.scope, reason: "negative" })
  const was = yield* read(sql)
  const active = new Set(was.people.map((p) => p.memberId))
  const gone = input.entries.find((e) => e.scope !== "workspace" && !active.has(e.scope))
  if (gone !== undefined) return yield* new BudgetInvalid({ scope: gone.scope, reason: "member_not_found" })
  const before = snapshot(was, input.entries.map((e) => e.scope))
  const changed = input.entries.filter((e, i) => before[i]!.limit !== e.limit)
  if (changed.length === 0) return new BudgetsSaved({ budgets: was, undo: null })
  yield* apply(sql, changed)
  const undo = yield* Undo.issue(sql, {
    command: RESTORE,
    compensation: { entries: snapshot(was, changed.map((e) => e.scope)) } satisfies typeof BudgetRestore.Type
  })
  return new BudgetsSaved({ budgets: yield* read(sql), undo })
})

/** `Shared.undo` for `ai_budgets.restore`: the limits as they were before the save. */
export const restore = Effect.fn("AiBudget.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.requireAction("ai.autonomy")
  yield* apply(sql, (compensation as typeof BudgetRestore.Type).entries)
})

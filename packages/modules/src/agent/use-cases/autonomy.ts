import {
  AGENT_ACTION,
  type AgentActionId,
  type AutonomyLevel,
  type AutonomyLevels,
  DEFAULT_LEVELS,
  isAgentActionId,
  levelsOf
} from "@insyte/domain/AgentActions"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AutonomyLocked,
  AutonomyPolicy,
  type AutonomyRestore,
  AutonomySaved,
  AutonomyStale,
  type Decision,
  type PolicyVersion,
  type SetAutonomyInput
} from "../domain/Autonomy.ts"

/*
 * Zelfstandigheid (M15 step 6; ADR-0027): the workspace's level per catalogue action, read by the whole team and
 * changed with the `ai.autonomy` special. Every save is a new version with what changed and who changed it; its undo
 * writes the previous version again, as a version of its own, so the history never loses a step. A save names the
 * version it was made on and is refused when someone saved since (`AutonomyStale`).
 */

export const RESTORE = "autonomy.restore"

type Limits = Readonly<
  Record<string, { readonly perDay?: number | undefined; readonly maxAmountMinor?: number | undefined }>
>

interface Row {
  readonly version: number
  readonly levels: Readonly<Record<string, unknown>>
  readonly limits: Limits
}

const current = (sql: SqlClient.SqlClient, lock: boolean) =>
  Effect.map(
    lock
      ? sql<Row>`select version, levels, limits from autonomy_policies for update`
      : sql<Row>`select version, levels, limits from autonomy_policies`,
    ([row]) => row ?? { version: 1, levels: {}, limits: {} }
  )

const history = (sql: SqlClient.SqlClient, limit: number) =>
  Effect.map(
    sql<{ version: number; changedAt: Date; by: string | null; diff: PolicyVersion["changes"] }>`
      select v.version, v.changed_at, v.diff,
             case when v.changed_by is null then null else coalesce(nullif(u.name, ''), 'Iemand') end as by
      from autonomy_policy_versions v
      left join members m on m.id = v.changed_by
      left join auth."user" u on u.id = m.user_id
      order by v.version desc
      limit ${limit}`,
    (rows): Array<PolicyVersion> =>
      rows.map((r) => ({ version: r.version, at: r.changedAt.getTime(), by: r.by, changes: r.diff }))
  )

const limitsOf = (stored: Limits): Limits =>
  Object.fromEntries(Object.entries(stored).filter(([id]) => isAgentActionId(id)))

const policyOf = (sql: SqlClient.SqlClient, row: Row, limit = 20) =>
  Effect.map(
    history(sql, limit),
    (h) =>
      new AutonomyPolicy({
        version: row.version,
        levels: levelsOf(row.levels),
        limits: limitsOf(row.limits),
        history: h
      })
  )

/** The policy in force, every catalogue action at its level (the default where none was set), with its history. */
export const get = Effect.fn("Autonomy.get")(function*(sql: SqlClient.SqlClient, limit?: number) {
  // Read by the whole team (the console's Zelfstandigheid page); an agent's principal reads none of it (RLS).
  return yield* policyOf(sql, yield* current(sql, false), Math.min(Math.max(limit ?? 20, 1), 100))
})

const diffOf = (from: AutonomyLevels, to: AutonomyLevels) =>
  (Object.keys(to) as Array<AgentActionId>).filter((id) => from[id] !== to[id]).map((id) => ({
    id,
    from: from[id],
    to: to[id]
  }))

/** Writes `levels` and `limits` as the next version on the caller's transaction; the version written, or none. */
const write = Effect.fn("Autonomy.write")(function*(
  sql: SqlClient.SqlClient,
  was: Row,
  levels: AutonomyLevels,
  limits: Limits
) {
  const principal = yield* CurrentPrincipal
  const before = levelsOf(was.levels)
  const changes = diffOf(before, levels)
  if (changes.length === 0 && JSON.stringify(limitsOf(was.limits)) === JSON.stringify(limits)) return null
  const version = was.version + 1
  // The workspace began at the default: that is version 1, kept once so the history starts somewhere.
  yield* sql`insert into autonomy_policy_versions (workspace_id, version, levels, limits, diff, changed_by)
             values (app_workspace_id(), 1, ${JSON.stringify(DEFAULT_LEVELS)}::jsonb, '{}'::jsonb, '[]'::jsonb, null)
             on conflict do nothing`
  yield* sql`insert into autonomy_policy_versions (workspace_id, version, levels, limits, diff, changed_by)
             values (app_workspace_id(), ${version}, ${JSON.stringify(levels)}::jsonb, ${JSON.stringify(limits)}::jsonb,
                     ${JSON.stringify(changes)}::jsonb, ${principal.id})`
  yield* sql`insert into autonomy_policies (workspace_id, version, levels, limits, updated_by)
             values (app_workspace_id(), ${version}, ${JSON.stringify(levels)}::jsonb, ${JSON.stringify(limits)}::jsonb,
                     ${principal.id})
             on conflict (workspace_id) do update
               set version = excluded.version, levels = excluded.levels, limits = excluded.limits,
                   updated_by = excluded.updated_by`
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: "autonomy_policy.changed",
    subjectType: "autonomy_policy",
    subjectId: principal.workspaceId,
    diff: { version, changes }
  })
  return version
})

const checkLevels = (levels: Readonly<Record<string, AutonomyLevel>>) =>
  Effect.gen(function*() {
    const unknown = Object.keys(levels).filter((id) => !isAgentActionId(id))
    if (unknown.length > 0) {
      return yield* new Invalid({ fields: Object.fromEntries(unknown.map((id) => [id, "unknown"])) })
    }
    const locked = Object.entries(levels).find(([id, level]) =>
      level === "auto" && AGENT_ACTION[id as AgentActionId].locked
    )
    if (locked !== undefined) return yield* new AutonomyLocked({ id: locked[0] })
  })

const checkLimits = (limits: Limits) => {
  const unknown = Object.keys(limits).filter((id) => !isAgentActionId(id))
  return unknown.length > 0
    ? Effect.fail(new Invalid({ fields: Object.fromEntries(unknown.map((id) => [`limits.${id}`, "unknown"])) }))
    : Effect.void
}

/** Without the empty limits, so a limit cleared is no limit. */
const tidy = (limits: Limits): Limits =>
  Object.fromEntries(
    Object.entries(limits).flatMap(([id, l]) => {
      const kept = {
        ...(l.perDay === undefined ? {} : { perDay: l.perDay }),
        ...(l.maxAmountMinor === undefined ? {} : { maxAmountMinor: l.maxAmountMinor })
      }
      return Object.keys(kept).length === 0 ? [] : [[id, kept]]
    })
  )

const saved = (sql: SqlClient.SqlClient, was: Row, version: number | null) =>
  Effect.gen(function*() {
    const now = yield* current(sql, false)
    const undo = version === null
      ? null
      : yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { toVersion: was.version } satisfies typeof AutonomyRestore.Type
      })
    return new AutonomySaved({ policy: yield* policyOf(sql, now), undo })
  })

/** Saves the levels (and limits) made on `baseVersion`; one undo puts the previous version back. */
export const set = Effect.fn("Autonomy.set")(function*(sql: SqlClient.SqlClient, input: SetAutonomyInput) {
  yield* Policy.requireAction("ai.autonomy")
  yield* checkLevels(input.levels)
  if (input.limits !== undefined) yield* checkLimits(input.limits)
  const was = yield* current(sql, true)
  if (was.version !== input.baseVersion) return yield* new AutonomyStale({ version: was.version })
  const levels = { ...levelsOf(was.levels), ...input.levels } as AutonomyLevels
  const limits = input.limits === undefined ? limitsOf(was.limits) : tidy(input.limits)
  return yield* saved(sql, was, yield* write(sql, was, levels, limits))
})

/** "Standaard herstellen": every action back to Eerst vragen, no limits; undoable like any save. */
export const resetDefaults = Effect.fn("Autonomy.resetDefaults")(
  function*(sql: SqlClient.SqlClient, baseVersion: number) {
    yield* Policy.requireAction("ai.autonomy")
    const was = yield* current(sql, true)
    if (was.version !== baseVersion) return yield* new AutonomyStale({ version: was.version })
    return yield* saved(sql, was, yield* write(sql, was, DEFAULT_LEVELS, {}))
  }
)

/** `Shared.undo` for `autonomy.restore`: the version the save replaced, written again as a new one. */
export const restore = Effect.fn("Autonomy.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.requireAction("ai.autonomy")
  const { toVersion } = compensation as typeof AutonomyRestore.Type
  const [target] = yield* sql<{ levels: Readonly<Record<string, unknown>>; limits: Limits }>`
    select levels, limits from autonomy_policy_versions where version = ${toVersion}`
  const levels = target === undefined ? DEFAULT_LEVELS : levelsOf(target.levels)
  if (target === undefined && toVersion !== 1) {
    return yield* new NotFound({ entity: "autonomy_policy", id: String(toVersion) })
  }
  const was = yield* current(sql, true)
  yield* write(sql, was, levels, limitsOf(target?.limits ?? {}))
})

/**
 * `Autonomy.decide`: whether the action runs, becomes a proposal, or does not happen, under the workspace's policy now.
 * Through `autonomy_decide`, which an agent principal may call though it reads no policy table.
 */
export const decide = Effect.fn("Autonomy.decide")(function*(
  sql: SqlClient.SqlClient,
  action: string,
  amountMinor: number | null
) {
  const [row] = yield* sql<
    { decision: Decision["decision"]; level: AutonomyLevel; policyVersion: number; refuseReason: string | null }
  >`
    select decision, level, policy_version, refuse_reason from autonomy_decide(${action}, ${amountMinor})`
  return {
    decision: row!.decision,
    level: row!.level,
    policyVersion: row!.policyVersion,
    reason: row!.refuseReason
  } satisfies Decision
})

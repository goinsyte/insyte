import { AGENT_ACTION, AGENT_ACTIONS, AGENT_REDO_SECONDS, type AgentActionId } from "@insyte/domain/AgentActions"
import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { ProposalAction } from "../../proposals/domain/Proposals.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AgentActionFixed,
  type AgentEffect,
  AgentLogChange,
  AgentLogCounts,
  AgentLogEntry,
  AgentLogPage,
  type ListInput
} from "../domain/AgentLog.ts"
import { AgentLinks } from "../Links.ts"

/*
 * Wat Insyte deed (M15 step 6; domain.md §9.8): one row per thing an agent ran, asked first or was refused, written by
 * `govern`. A person sees the rows of the areas they can read; taking one back needs that area's Bewerken. Inside the
 * window (five minutes) "Ongedaan maken" spends the action's own undo token, held by the agent, on the person's
 * transaction; after it, the catalogue's compensation runs as the person's own command. "Toch laten staan" puts an
 * undone action back, for a moment, by the person who took it back.
 */

/** The caller's transaction, opened as often as the use case needs one (a command run between two). */
export type Scoped = <A, E, R>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E | SqlError.SqlError, R | CurrentPrincipal>

export interface NewAction {
  readonly id?: string
  readonly action: AgentActionId
  readonly input: unknown
  readonly storeId: string | null
  readonly subject: { readonly type: string; readonly id: string; readonly label: string } | null
  readonly trigger: { readonly kind: string; readonly label: string }
  readonly policyVersion: number
  readonly level: "auto" | "ask" | "never"
  readonly decision: "run" | "propose" | "refuse"
  readonly refuseReason: string | null
  readonly reason: string
  readonly sentence: string
  readonly before: string | null
  readonly after: string | null
  readonly effect: AgentEffect | null
  readonly outcome: "done" | "failed" | "proposed" | "refused"
  readonly error: string | null
  readonly proposalId: string | null
  readonly undo: { readonly hash: string; readonly until: Date } | null
  readonly dedupeKey: string | null
}

/** Writes one row of the log on the caller's transaction, with its touchpoint where it has one; its id. */
export const record = Effect.fn("AgentLog.record")(function*(sql: SqlClient.SqlClient, row: NewAction) {
  const principal = yield* CurrentPrincipal
  const id = row.id ?? mintId("aga")
  const kind = principal.kind === "agent" || principal.kind === "api_key" ? principal.kind : "system"
  yield* sql`insert into agent_actions
               (id, workspace_id, store_id, action, input, subject_type, subject_id, subject_label, principal_kind,
                principal_id, trigger, trigger_label, policy_version, level, decision, refuse_reason, reason, sentence,
                before_text, after_text, effect, compensation, dedupe_key, outcome, error, proposal_id, undo_token_hash,
                undo_principal, undo_until)
             values (${id}, app_workspace_id(), ${row.storeId}, ${row.action}, ${
    JSON.stringify(row.input ?? null)
  }::jsonb,
                     ${row.subject?.type ?? null}, ${row.subject?.id ?? null}, ${row.subject?.label ?? null}, ${kind},
                     ${principal.id}, ${row.trigger.kind}, ${row.trigger.label}, ${row.policyVersion}, ${row.level},
                     ${row.decision}, ${row.refuseReason}, ${row.reason}, ${row.sentence}, ${row.before}, ${row.after},
                     ${row.effect === null ? null : JSON.stringify(row.effect)}::jsonb,
                     ${
    row.effect === null || row.effect.kind === "token" ? null : AGENT_ACTION[row.action].compensation ?? null
  },
                     ${row.dedupeKey}, ${row.outcome}, ${row.error}, ${row.proposalId},
                     decode(${row.undo === null ? null : row.undo.hash}, 'hex'), ${
    row.undo === null ? null : principal.id
  },
                     ${row.undo?.until ?? null})`
  // Who did what, as every change is recorded; the log's open tabs read again by it (`records.changed`).
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: `agent_action.${row.outcome}`,
    subjectType: "agent_action",
    subjectId: id,
    diff: { action: row.action, decision: row.decision, policyVersion: row.policyVersion }
  })
  if (row.dedupeKey !== null) {
    yield* sql`insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
               values (app_workspace_id(), ${row.dedupeKey}, ${id}) on conflict do nothing`
  }
  return id
})

/** The touchpoint's earlier row, where this trigger was already seen. */
export const seen = Effect.fn("AgentLog.seen")(function*(sql: SqlClient.SqlClient, dedupeKey: string) {
  const [row] = yield* sql<{ id: string; outcome: string; proposalId: string | null; refuseReason: string | null }>`
    select a.id, a.outcome, a.proposal_id, a.refuse_reason
    from agent_touchpoints t join agent_actions a on a.id = t.agent_action_id
    where t.dedupe_key = ${dedupeKey}`
  return row
})

/** The catalogue actions whose rows the caller may see: those of the areas they can read. */
const visibleActions = Effect.map(Effect.service(CurrentPrincipal), (p) => {
  const role = { ...p.role, stores: p.role.stores === "all" ? ("all" as const) : [...p.role.stores] }
  return AGENT_ACTIONS.filter((a) => canRole(role, a.area, 1)).map((a) => a.id as string)
})

interface Row {
  readonly id: string
  readonly createdAt: Date
  readonly action: AgentActionId
  readonly sentence: string
  readonly subjectType: string | null
  readonly subjectId: string | null
  readonly subjectLabel: string | null
  readonly level: "auto" | "ask" | "never"
  readonly trigger: string
  readonly triggerLabel: string
  readonly outcome: "done" | "failed" | "undone" | "compensated" | "proposed" | "refused"
  readonly undoneByName: string | null
  readonly error: string | null
  readonly sources: ReadonlyArray<{ kind: string; title: string; detail: string; to: string | null }>
  readonly reason: string
  readonly beforeText: string | null
  readonly afterText: string | null
  readonly policyVersion: number
  readonly model: string | null
  readonly promptVersion: string | null
  readonly undoUntil: Date | null
  readonly hasToken: boolean
  readonly compensation: string | null
}

const columns = (sql: SqlClient.SqlClient) =>
  sql`a.id, a.created_at, a.action, a.sentence, a.subject_type, a.subject_id, a.subject_label, a.level, a.trigger,
      a.trigger_label, a.outcome, a.error, a.sources, a.reason, a.before_text, a.after_text, a.policy_version, a.model,
      a.prompt_version, a.undo_until, a.undo_token_hash is not null as has_token, a.compensation,
      case when a.undone_by is null then null else coalesce(nullif(u.name, ''), 'Iemand') end as undone_by_name`

const joins = (sql: SqlClient.SqlClient) =>
  sql`left join members m on m.id = a.undone_by left join auth."user" u on u.id = m.user_id`

const entryOf = (r: Row, now: number) => {
  const open = r.outcome === "done" && r.hasToken && r.undoUntil !== null && r.undoUntil.getTime() > now
  return new AgentLogEntry({
    id: r.id,
    at: r.createdAt.getTime(),
    action: r.action,
    sentence: r.sentence,
    subject: r.subjectType === null || r.subjectId === null
      ? null
      : { type: r.subjectType, id: r.subjectId, label: r.subjectLabel ?? r.subjectId },
    level: r.level,
    approvedBy: null,
    trigger: r.triggerLabel,
    triggerKind: r.trigger,
    status: r.outcome === "failed"
      ? "failed"
      : r.outcome === "undone" || r.outcome === "compensated"
      ? "undone"
      : "done",
    undoneBy: r.undoneByName,
    failReason: r.error,
    sources: r.sources,
    reason: r.reason,
    before: r.beforeText,
    after: r.afterText,
    policyVersion: r.policyVersion,
    model: r.model,
    promptVersion: r.promptVersion,
    undoUntil: r.hasToken && r.undoUntil !== null ? r.undoUntil.getTime() : null,
    compensation: r.outcome === "done" ? r.compensation : null,
    reversible: open || (r.outcome === "done" && r.compensation !== null)
  })
}

const counts = Effect.fn("AgentLog.counts")(function*(sql: SqlClient.SqlClient, actions: ReadonlyArray<string>) {
  if (actions.length === 0) {
    return new AgentLogCounts({
      total: 0,
      undoable: 0,
      auto: 0,
      undone: 0,
      failed: 0,
      today: 0,
      todayUndone: 0,
      todayFailed: 0
    })
  }
  const [c] = yield* sql<{
    total: number
    undoable: number
    auto: number
    undone: number
    failed: number
    today: number
    todayUndone: number
    todayFailed: number
  }>`
    with day as (
      select (date_trunc('day', now() at time zone coalesce(w.timezone, 'Europe/Amsterdam'))
              at time zone coalesce(w.timezone, 'Europe/Amsterdam')) as start
      from workspaces w where w.id = app_workspace_id()
    )
    select count(*)::int as total,
           count(*) filter (where a.outcome = 'done' and a.undo_token_hash is not null and a.undo_until > now())::int
             as undoable,
           count(*) filter (where a.level = 'auto')::int as auto,
           count(*) filter (where a.outcome in ('undone', 'compensated'))::int as undone,
           count(*) filter (where a.outcome = 'failed')::int as failed,
           count(*) filter (where a.created_at >= day.start)::int as today,
           count(*) filter (where a.created_at >= day.start and a.outcome in ('undone', 'compensated'))::int
             as today_undone,
           count(*) filter (where a.created_at >= day.start and a.outcome = 'failed')::int as today_failed
    from agent_actions a cross join day
    where a.decision = 'run' and a.action in ${sql.in([...actions])}`
  return new AgentLogCounts(c!)
})

/** The log, newest first, with its counts; narrowed by action, record or time. */
export const list = Effect.fn("AgentLog.list")(function*(sql: SqlClient.SqlClient, input: ListInput) {
  const visible = yield* visibleActions
  const actions = input.action === undefined ? visible : visible.filter((a) => a === input.action)
  if (actions.length === 0) return new AgentLogPage({ rows: [], counts: yield* counts(sql, []) })
  const rows = yield* sql<Row>`
    select ${columns(sql)}
    from agent_actions a ${joins(sql)}
    where a.decision = 'run' and a.action in ${sql.in(actions)}
      ${input.subjectType === undefined ? sql`` : sql`and a.subject_type = ${input.subjectType}`}
      ${input.subjectId === undefined ? sql`` : sql`and a.subject_id = ${input.subjectId}`}
      ${input.since === undefined ? sql`` : sql`and a.created_at >= ${new Date(input.since)}`}
    order by a.created_at desc, a.id desc
    limit ${input.limit ?? 200}`
  const now = Date.now()
  return new AgentLogPage({ rows: rows.map((r) => entryOf(r, now)), counts: yield* counts(sql, visible) })
})

export const countsOf = Effect.fn("AgentLog.countsOf")(function*(sql: SqlClient.SqlClient) {
  return yield* counts(sql, yield* visibleActions)
})

/** One row the caller may see, locked for a change where `lock`; `NotFound` otherwise. */
const one = Effect.fn("AgentLog.one")(function*(sql: SqlClient.SqlClient, id: string, lock = false) {
  const visible = yield* visibleActions
  const [row] = lock
    ? yield* sql<
      Row & {
        readonly input: string | null
        readonly effect: string | null
        readonly tokenHash: string | null
        readonly undoPrincipal: string | null
        readonly undoneBy: string | null
        readonly undoneAt: Date | null
      }
    >`
        select ${columns(sql)}, a.input::text as input, a.effect::text as effect,
               encode(a.undo_token_hash, 'hex') as token_hash, a.undo_principal, a.undone_by, a.undone_at
        from agent_actions a ${joins(sql)}
        where a.id = ${id} and a.decision = 'run'
        for update of a`
    : yield* sql<
      Row & {
        readonly input: string | null
        readonly effect: string | null
        readonly tokenHash: string | null
        readonly undoPrincipal: string | null
        readonly undoneBy: string | null
        readonly undoneAt: Date | null
      }
    >`
        select ${columns(sql)}, a.input::text as input, a.effect::text as effect,
               encode(a.undo_token_hash, 'hex') as token_hash, a.undo_principal, a.undone_by, a.undone_at
        from agent_actions a ${joins(sql)}
        where a.id = ${id} and a.decision = 'run'`
  if (row === undefined || !visible.includes(row.action)) return yield* new NotFound({ entity: "agent_action", id })
  // Read as text: the client's camel-casing of result names reaches into jsonb too, and would turn `_tag` into `Tag`.
  return {
    ...row,
    input: row.input === null ? null : (JSON.parse(row.input) as unknown),
    effect: row.effect === null ? null : (JSON.parse(row.effect) as AgentEffect | null)
  }
})

export const get = Effect.fn("AgentLog.get")(function*(sql: SqlClient.SqlClient, id: string) {
  return entryOf(yield* one(sql, id), Date.now())
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff: Record<string, unknown> = {}) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "agent_action",
        subjectId: id,
        diff
      })
  )

const changed = (sql: SqlClient.SqlClient, id: string) =>
  Effect.map(one(sql, id), (row) => new AgentLogChange({ entry: entryOf(row, Date.now()), undo: null }))

/**
 * "Ongedaan maken" inside the window: the action's own undo token, held by the agent, spent for the person on their
 * transaction, its compensation run as theirs. Its effects still waiting are cancelled; what already left stays sent.
 */
export const undo = Effect.fn("AgentLog.undo")(function*(sql: SqlClient.SqlClient, id: string) {
  const principal = yield* CurrentPrincipal
  const links = yield* AgentLinks
  const row = yield* one(sql, id, true)
  yield* Policy.require(AGENT_ACTION[row.action].area, 2)
  if (row.outcome !== "done") return yield* new AgentActionFixed({ id, reason: "state" })
  if (row.tokenHash === null || row.undoPrincipal === null) {
    return yield* new AgentActionFixed({ id, reason: "irreversible" })
  }
  if (row.undoUntil === null || row.undoUntil.getTime() <= Date.now()) {
    return yield* new AgentActionFixed({ id, reason: "window" })
  }
  const spent = yield* Undo.redeemByHash(sql, row.tokenHash, { outer: true, owner: row.undoPrincipal }).pipe(
    Effect.catchTag("Conflict", () => Effect.fail(new AgentActionFixed({ id, reason: "state" })))
  )
  yield* links.takeBack(sql, spent.command, spent.compensation)
  yield* sql`update agent_actions set outcome = 'undone', undone_by = ${principal.id}, undone_at = now()
             where id = ${id}`
  yield* audit(sql, "agent_action.undone", id, { action: row.action })
  return yield* changed(sql, id)
})

/** After the window: the catalogue's compensation ("Toewijzing weghalen"), as the person's own command. */
export const compensate = Effect.fn("AgentLog.compensate")(function*(
  scoped: Scoped,
  id: string
) {
  const principal = yield* CurrentPrincipal
  const links = yield* AgentLinks
  const row = yield* scoped((sql) => one(sql, id))
  yield* Policy.require(AGENT_ACTION[row.action].area, 2)
  if (row.outcome !== "done") return yield* new AgentActionFixed({ id, reason: "state" })
  if (row.effect === null || row.effect.kind === "token" || row.compensation === null) {
    return yield* new AgentActionFixed({ id, reason: "irreversible" })
  }
  yield* links.compensate(row.effect)
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`update agent_actions set outcome = 'compensated', undone_by = ${principal.id}, undone_at = now()
                 where id = ${id} and outcome = 'done'`
      yield* audit(sql, "agent_action.compensated", id, { action: row.action })
      return yield* changed(sql, id)
    })
  )
})

/** "Toch laten staan": the action undone a moment ago run again, as the person who took it back. */
export const redo = Effect.fn("AgentLog.redo")(function*(
  scoped: Scoped,
  id: string
) {
  const principal = yield* CurrentPrincipal
  const links = yield* AgentLinks
  const row = yield* scoped((sql) => one(sql, id))
  yield* Policy.require(AGENT_ACTION[row.action].area, 2)
  if (
    row.outcome !== "undone" || row.undoneBy !== principal.id || row.undoneAt === null ||
    row.undoneAt.getTime() + AGENT_REDO_SECONDS * 1000 < Date.now()
  ) return yield* new AgentActionFixed({ id, reason: "redo_window" })
  if (row.input === null) return yield* new AgentActionFixed({ id, reason: "irreversible" })
  yield* links.rerun(row.input as ProposalAction)
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      // Back as it was, but no longer the agent's to take back: the person ran it now.
      yield* sql`update agent_actions set outcome = 'done', undone_by = null, undone_at = null, undo_token_hash = null,
                                          undo_principal = null, undo_until = null
                 where id = ${id} and outcome = 'undone'`
      yield* audit(sql, "agent_action.redone", id, { action: row.action })
      return yield* changed(sql, id)
    })
  )
})

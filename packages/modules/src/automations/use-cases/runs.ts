import { Db } from "@insyte/database/Db"
import { type StepRow, timelineOf } from "@insyte/domain/automations/Engine"
import type { Flow } from "@insyte/domain/automations/Graph"
import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { AutomationRuns } from "../domain/Ports.ts"
import {
  RunChange,
  RunCounts,
  RunDay,
  RunDetail,
  RunList,
  type RunListInput,
  RunRecord,
  type RunRecordsInput,
  RunRow,
  RunStats,
  type RunStatsInput,
  type RunStatus,
  RunStep
} from "../domain/Runs.ts"
import { keyOf } from "./engine.ts"

/*
 * A flow's runs (M12 step 5; api.md §2.14): the list with its counts, one run with its steps over its pinned version,
 * the per-day figures for Overzicht and the records it ran for; "Opnieuw" (the same key, so what the first run did is
 * not done again), stopping a run, and the answer to "Goedkeuring vragen". Automatiseringen · Bekijken reads them,
 * Beheren runs one again or stops it, Bewerken starts one by hand; the approval is the teammate the step names, or someone who may publish.
 */

interface RawRun {
  readonly id: string
  readonly automationId: string
  readonly automationName: string
  readonly version: number
  readonly status: RunStatus
  readonly reason: string | null
  readonly triggerVariant: string
  readonly summary: string
  readonly recordKind: string
  readonly recordId: string
  readonly triggerEvent: string
  readonly startedAt: Date
  readonly finishedAt: Date | null
  readonly orderNumber: string | null
  readonly customerName: string | null
  readonly steps: number
}

const SELECT = (sql: SqlClient.SqlClient) =>
  sql`
    select r.id, r.automation_id, a.name as automation_name, r.version, r.status, r.reason, r.trigger_variant,
           r.summary, r.record_kind, r.record_id, r.trigger_event, r.started_at, r.finished_at,
           o.number as order_number, o.customer_name,
           (select count(*)::int from automation_run_steps s
            where s.run_id = r.id and s.status in ('succeeded', 'failed')) as steps
    from automation_runs r
    join automations a on a.id = r.automation_id
    left join orders o on r.record_kind = 'order' and o.id = r.record_id`

/** The role's stores: a run about an order outside them is not shown. */
const visible = (sql: SqlClient.SqlClient) =>
  Effect.map(inScope(sql, "o.store_id"), (scope) => sql`(o.id is null or ${scope})`)

const causeOf = (r: RawRun) => {
  const trigger = STEPS_BY_ID[r.triggerVariant]?.label ?? "De trigger"
  return r.triggerEvent.startsWith("rerun:") ? "Opnieuw gestart" : r.triggerEvent.startsWith("manual:")
    ? "Met de hand gestart"
    : trigger
}

const rowOf = (r: RawRun) =>
  new RunRow({
    id: r.id,
    automationId: r.automationId,
    automationName: r.automationName,
    version: r.version,
    status: r.status,
    reason: r.reason,
    triggerVariant: r.triggerVariant,
    cause: causeOf(r),
    record: r.recordKind === "order"
      ? { kind: "order", id: r.recordId, number: r.orderNumber ?? "", name: r.customerName ?? "" }
      : null,
    manual: r.triggerEvent.startsWith("rerun:") || r.triggerEvent.startsWith("manual:"),
    key: keyOf(r),
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt?.getTime() ?? null,
    durationMs: Math.max(0, (r.finishedAt?.getTime() ?? Date.now()) - r.startedAt.getTime()),
    steps: r.steps
  })

const countsOf = (rows: ReadonlyArray<{ status: string; n: number }>) => {
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0
  return new RunCounts({
    all: rows.reduce((t, r) => t + r.n, 0),
    running: n("running"),
    waiting: n("waiting"),
    succeeded: n("succeeded"),
    failed: n("failed"),
    stopped: n("stopped"),
    skipped: n("skipped")
  })
}

const cursorOf = (r: RawRun) => `${r.startedAt.getTime()}_${r.id}`
const parseCursor = (cursor: string | null | undefined) => {
  if (cursor == null) return null
  const at = cursor.indexOf("_")
  const ms = Number(cursor.slice(0, at))
  return at < 0 || !Number.isFinite(ms) ? null : { at: new Date(ms), id: cursor.slice(at + 1) }
}

export const list = Effect.fn("Runs.list")(function*(input: typeof RunListInput.Type) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  const limit = input.limit ?? 50
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* visible(sql)
      const flow = input.automationId === undefined ? sql`true` : sql`r.automation_id = ${input.automationId}`
      const status = input.status === undefined ? sql`true` : sql`r.status = ${input.status}`
      const after = parseCursor(input.cursor)
      const page = yield* sql<RawRun>`
        ${SELECT(sql)}
        where a.deleted_at is null and ${scope} and ${flow} and ${status}
          ${after === null ? sql`` : sql`and (r.started_at, r.id) < (${after.at}, ${after.id})`}
        order by r.started_at desc, r.id desc limit ${limit + 1}`
      const counts = yield* sql<{ status: string; n: number }>`
        select r.status, count(*)::int as n from automation_runs r
        join automations a on a.id = r.automation_id
        left join orders o on r.record_kind = 'order' and o.id = r.record_id
        where a.deleted_at is null and ${scope} and ${flow}
        group by r.status`
      const rows = page.slice(0, limit)
      return new RunList({
        rows: rows.map(rowOf),
        counts: countsOf(counts),
        next: page.length > limit ? cursorOf(rows[rows.length - 1]!) : null
      })
    })
  )
})

const runOf = Effect.fn("Runs.runOf")(function*(sql: SqlClient.SqlClient, id: string, lock = false) {
  const scope = yield* visible(sql)
  const [r] = yield* sql<RawRun>`
    ${SELECT(sql)} where r.id = ${id} and a.deleted_at is null and ${scope}
    ${lock ? sql`for update of r` : sql``}`
  if (r === undefined) return yield* new NotFound({ entity: "run", id })
  return r
})

const detailOf = Effect.fn("Runs.detailOf")(function*(sql: SqlClient.SqlClient, r: RawRun) {
  const [v] = yield* sql<{ nodesJson: string }>`
    select nodes::text as nodes_json from automation_versions
    where automation_id = ${r.automationId} and version = ${r.version}`
  const nodes = v === undefined ? [] : (JSON.parse(v.nodesJson) as Flow)
  const raw = yield* sql<{
    nodeId: string
    status: StepRow["status"]
    attempt: number
    ms: number
    explanation: string | null
    lane: string | null
    inputJson: string
  }>`
    select node_id, status, attempt, explanation, output ->> 'lane' as lane, input::text as input_json,
           coalesce(extract(epoch from (finished_at - started_at)) * 1000, 0)::int as ms
    from automation_run_steps where run_id = ${r.id} order by started_at, node_id, attempt`
  const open = r.status === "running" || r.status === "waiting"
  const steps = timelineOf(
    nodes,
    raw.map((s) => ({
      nodeId: s.nodeId,
      status: s.status,
      attempt: s.attempt,
      ms: s.ms,
      explanation: s.explanation,
      lane: s.lane === "yes" || s.lane === "no" ? s.lane : undefined
    })),
    open
  )
  const head = nodes[0]
  const triggerRow = raw.find((s) => s.nodeId === head?.id)
  const input = triggerRow === undefined ? {} : (JSON.parse(triggerRow.inputJson) as Record<string, string>)
  const waiting = open ? steps.find((s) => s.status === "waiting") : undefined
  return new RunDetail({
    run: rowOf(r),
    steps: steps.map((s) => new RunStep({ ...s, config: { ...s.config } })),
    input,
    waitingOn: waiting === undefined
      ? null
      : {
        nodeId: waiting.nodeId,
        kind: waiting.variantId === "action.require_approval"
          ? "approval"
          : waiting.variantId === "delay.wait_no_reply"
          ? "reply"
          : "wait",
        approver: waiting.variantId === "action.require_approval" ? String(waiting.config["approver"] ?? "") : null
      }
  })
})

export const get = Effect.fn("Runs.get")(function*(id: string) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.flatMap(runOf(sql, id), (r) => detailOf(sql, r)))
})

const flowExists = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql<{ id: string }>`select id from automations where id = ${id} and deleted_at is null`,
    ([row]) => (row === undefined ? Effect.fail(new NotFound({ entity: "automation", id })) : Effect.void)
  )

/** Per day over the last `days`, and the totals over them. */
export const stats = Effect.fn("Runs.stats")(function*(input: typeof RunStatsInput.Type) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* flowExists(sql, input.automationId)
      const scope = yield* visible(sql)
      const rows = yield* sql<{ day: string; status: string; n: number }>`
        select to_char(date_trunc('day', r.started_at at time zone 'UTC'), 'YYYY-MM-DD') as day, r.status,
               count(*)::int as n
        from automation_runs r left join orders o on r.record_kind = 'order' and o.id = r.record_id
        where r.automation_id = ${input.automationId} and ${scope}
          and r.started_at > now() - make_interval(days => ${input.days})
        group by 1, 2`
      const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
      const days = Array.from({ length: input.days }, (_, i) => {
        const day = new Date(today - (input.days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
        const of = (s: string) => rows.filter((r) => r.day === day && r.status === s).reduce((t, r) => t + r.n, 0)
        const all = rows.filter((r) => r.day === day).reduce((t, r) => t + r.n, 0)
        return new RunDay({
          day,
          succeeded: of("succeeded"),
          failed: of("failed"),
          other: all - of("succeeded") - of("failed")
        })
      })
      const totals = new Map<string, number>()
      for (const r of rows) totals.set(r.status, (totals.get(r.status) ?? 0) + r.n)
      return new RunStats({ days, totals: countsOf([...totals].map(([status, n]) => ({ status, n }))) })
    })
  )
})

/** "Gekoppelde records": the records a flow ran for, the most recent first. */
export const records = Effect.fn("Runs.records")(function*(input: typeof RunRecordsInput.Type) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* flowExists(sql, input.automationId)
      const scope = yield* visible(sql)
      const rows = yield* sql<{
        recordId: string
        number: string | null
        name: string | null
        runs: number
        lastStatus: RunStatus
        lastAt: Date
      }>`
        select r.record_id, max(o.number) as number, max(o.customer_name) as name, count(*)::int as runs,
               (array_agg(r.status order by r.started_at desc))[1] as last_status, max(r.started_at) as last_at
        from automation_runs r left join orders o on r.record_kind = 'order' and o.id = r.record_id
        where r.automation_id = ${input.automationId} and r.record_kind = 'order' and ${scope}
        group by r.record_id order by last_at desc limit ${input.limit ?? 8}`
      return rows.map((r) =>
        new RunRecord({
          record: { kind: "order", id: r.recordId, number: r.number ?? "", name: r.name ?? "" },
          runs: r.runs,
          lastStatus: r.lastStatus,
          lastAt: r.lastAt.getTime()
        })
      )
    })
  )
})

/**
 * A run row for a flow's live version on one record, started by hand; `skipped` with its reason when the flow is
 * off or has no account. Answers its id, and whether the Workflow should start.
 */
const insertRun = Effect.fn("Runs.insertRun")(function*(
  sql: SqlClient.SqlClient,
  automationId: string,
  recordId: string,
  triggerEvent: string
) {
  const [flow] = yield* sql<{
    workspaceId: string
    liveVersion: number
    status: string
    triggerVariant: string | null
    accountId: string | null
  }>`
    select a.workspace_id, a.live_version, a.status, a.trigger_variant, sa.id as account_id
    from automations a left join service_accounts sa on sa.automation_id = a.id and sa.disabled_at is null
    where a.id = ${automationId} and a.deleted_at is null for update of a`
  if (flow === undefined) return yield* new NotFound({ entity: "automation", id: automationId })
  if (flow.liveVersion === 0) return yield* new Conflict({ entity: "automation", reason: "not_published" })
  const scope = yield* inScope(sql, "o.store_id")
  const [order] = yield* sql<{ id: string }>`select o.id from orders o where o.id = ${recordId} and ${scope}`
  if (order === undefined) return yield* new NotFound({ entity: "order", id: recordId })
  const reason = flow.status !== "active"
    ? "De flow staat uit."
    : flow.accountId === null
    ? "De flow heeft geen actief serviceaccount."
    : null
  const id = mintId("run")
  yield* sql`
    insert into automation_runs (id, workspace_id, automation_id, version, service_account_id, trigger_event,
                                 trigger_variant, summary, record_kind, record_id, status, reason, finished_at)
    values (${id}, ${flow.workspaceId}, ${automationId}, ${flow.liveVersion}, ${flow.accountId}, ${triggerEvent},
            ${flow.triggerVariant ?? ""}, ${"met de hand gestart"}, ${"order"}, ${recordId},
            ${reason === null ? "running" : "skipped"}, ${reason}, ${reason === null ? null : new Date()})`
  yield* sql`update automations set runs_total = runs_total + 1 where id = ${automationId}`
  return { id, workspaceId: flow.workspaceId, start: reason === null }
})

const started = Effect.fn("Runs.started")(function*(
  sql: SqlClient.SqlClient,
  made: { readonly id: string; readonly workspaceId: string; readonly start: boolean },
  action: string
) {
  const principal = yield* CurrentPrincipal
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action,
    subjectType: "automation_run",
    subjectId: made.id
  })
  return made
})

/** Starts the Workflow once the row is committed; the Workflow waits for the row if it is quicker. */
const kick = (made: { readonly id: string; readonly workspaceId: string; readonly start: boolean }) =>
  made.start
    ? Effect.flatMap(Effect.service(AutomationRuns), (runs) =>
      runs.start({ workspaceId: made.workspaceId, runId: made.id }))
    : Effect.void

/** `POST /v1/automations/{id}/runs`: the flow's live version on one order, by hand. */
export const start = Effect.fn("Runs.start")(
  function*(input: { readonly automationId: string; readonly recordId: string }) {
    // Bewerken, as a key's automations.write: the run acts as the flow's own account, not as the caller.
    yield* Policy.require("automations", 2)
    const db = yield* Db
    const made = yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const m = yield* insertRun(sql, input.automationId, input.recordId, `manual:${mintId("evt")}`)
        return yield* started(sql, m, "automation_run.started")
      })
    )
    yield* kick(made)
    return yield* get(made.id)
  }
)

/** "Opnieuw": the same record again on the live version, under the first run's key. */
export const rerun = Effect.fn("Runs.rerun")(function*(id: string) {
  yield* Policy.require("automations", 3)
  const db = yield* Db
  const made = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const r = yield* runOf(sql, id)
      if (r.status === "running" || r.status === "waiting") {
        return yield* new Conflict({ entity: "run", reason: "still_running" })
      }
      const key = keyOf(r)
      const [n] = yield* sql<{ n: number }>`
        select count(*)::int as n from automation_runs
        where automation_id = ${r.automationId} and trigger_event like ${`rerun:${key}:%`}`
      const m = yield* insertRun(sql, r.automationId, r.recordId, `rerun:${key}:${(n?.n ?? 0) + 1}`)
      return yield* started(sql, m, "automation_run.rerun")
    })
  )
  yield* kick(made)
  return new RunChange({ run: (yield* get(made.id)).run })
})

/** Stops a running or waiting run: nothing more is done; what it did stays done. */
export const cancel = Effect.fn("Runs.cancel")(function*(id: string) {
  yield* Policy.require("automations", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const r = yield* runOf(sql, id, true)
      if (r.status !== "running" && r.status !== "waiting") {
        return yield* new Conflict({ entity: "run", reason: "not_running" })
      }
      yield* sql`
        update automation_runs set status = 'stopped', reason = ${"Gestopt in het tabblad Runs."}, finished_at = now()
        where id = ${id}`
      yield* sql`
        update automation_run_steps set status = 'stopped', finished_at = now(),
               explanation = ${"De run is gestopt terwijl deze stap wachtte."}
        where run_id = ${id} and status = 'waiting'`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "automation_run.cancelled",
        subjectType: "automation_run",
        subjectId: id
      })
    })
  )
  yield* Effect.flatMap(Effect.service(AutomationRuns), (runs) => runs.cancel({ runId: id }))
  return new RunChange({ run: (yield* get(id)).run })
})

/**
 * The answer to "Goedkeuring vragen": the teammate the step names gives it, or someone who may publish the flow.
 * The run goes on (approved) or stops (declined) once the Workflow hears it.
 */
const answer = (approved: boolean) =>
  Effect.fn(approved ? "Runs.approve" : "Runs.decline")(
    function*(input: { readonly id: string; readonly stepId: string }) {
      yield* Policy.require("automations", 1)
      const principal = yield* CurrentPrincipal
      const db = yield* Db
      const by = yield* db.scoped((sql) =>
        Effect.gen(function*() {
          const r = yield* runOf(sql, input.id, true)
          const detail = yield* detailOf(sql, r)
          const waiting = detail.waitingOn
          if (waiting === null || waiting.kind !== "approval" || waiting.nodeId !== input.stepId) {
            return yield* new Conflict({ entity: "run", reason: "not_waiting" })
          }
          const [me] = principal.userId === null
            ? []
            : yield* sql<{ name: string }>`select name from auth."user" where id = ${principal.userId}`
          const named = (waiting.approver ?? "").trim().toLowerCase()
          const mayPublish = canRole(
            { ...principal.role, stores: principal.role.stores === "all" ? "all" : [...principal.role.stores] },
            "automations.publish"
          )
          if (!mayPublish && (me === undefined || named === "" || me.name.trim().toLowerCase() !== named)) {
            return yield* new Forbidden({
              permission: "automations.publish",
              level: 0,
              roleLabel: principal.role.label
            })
          }
          yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
            action: approved ? "automation_run.approved" : "automation_run.declined",
            subjectType: "automation_run",
            subjectId: input.id,
            diff: { step: input.stepId }
          })
          return me?.name ?? principal.role.label
        })
      )
      yield* Effect.flatMap(
        Effect.service(AutomationRuns),
        (runs) => runs.decide({ runId: input.id, nodeId: input.stepId, approved, by })
      )
      return new RunChange({ run: (yield* get(input.id)).run })
    }
  )

export const approve = answer(true)
export const decline = answer(false)

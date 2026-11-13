import { Db } from "@insyte/database/Db"
import { fill, holds, missingIn, type RunContext, startedBy } from "@insyte/domain/automations/Engine"
import type { Flow } from "@insyte/domain/automations/Graph"
import { SCOPE_LABEL } from "@insyte/domain/automations/Scopes"
import { BRAND_NAME, STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { CustomersService } from "../../customers/Customers.ts"
import { type OutboxEvent, Relay } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { TicketsService } from "../../tickets/Tickets.ts"
import { principalOf } from "./accounts.ts"
import { connectedBrands } from "./read.ts"

/*
 * The engine's slice half (M12 step 3). The relay's `automations` sink starts a run per active flow and record an event
 * names (`startRuns`), each on the flow's live version, inside the flow's hourly limit; the Workflow reads its run
 * (`loadRun`), decides each step and writes what it did (`recordStep`), carries out the actions that run today as the
 * flow's service account (`act`), and closes the run (`finishRun`), telling the flow's watcher when it failed.
 */

/** A step that could not be done, said for the run's history; `terminal` when trying again cannot help. */
export class StepFailed extends Schema.TaggedError<StepFailed>()("StepFailed", {
  explanation: Schema.String,
  terminal: Schema.Boolean
}) {}

/** The run as the Workflow carries it between steps: plain data, so it survives the Workflow's replays. */
export interface RunPlan {
  readonly runId: string
  readonly workspaceId: string
  readonly automationId: string
  readonly name: string
  readonly version: number
  readonly runAt: string
  readonly recordKind: string
  readonly recordId: string
  readonly nodes: Flow
  readonly context: RunContext
  readonly account: { id: string; label: string; version: number; scopes: Array<string> } | null
  readonly storeScope: Array<string> | null
  readonly connected: Array<string>
  /** Actions an earlier run of the same key already did: "Opnieuw" does not do them twice. */
  readonly done: Array<string>
}

/* ── starting runs ─────────────────────────────────────────────────────────────────────────── */

/**
 * The runs an event starts, as `running` rows, in the event's workspace scope (the relay's transaction). One per active
 * flow on that trigger and record; the same event again starts nothing. Past the flow's hourly limit, or without an
 * enabled account, the run is written `skipped` with its reason, so the history says why nothing happened.
 */
export const startRuns = Effect.fn("Automations.startRuns")(function*(
  sql: SqlClient.SqlClient,
  outboxId: string,
  event: OutboxEvent
) {
  const started = startedBy(event as unknown as { type: string } & Record<string, unknown>)
  if (started === undefined || started.recordIds.length === 0) return []
  const flows = yield* sql<{
    id: string
    workspaceId: string
    liveVersion: number
    storeScope: Array<string> | null
    rateLimit: number
    accountId: string | null
  }>`
    select a.id, a.workspace_id, a.live_version, a.store_scope, coalesce(s.rate_limit_per_hour, 0) as rate_limit,
           sa.id as account_id
    from automations a
    left join automation_settings s on s.automation_id = a.id
    left join service_accounts sa on sa.automation_id = a.id and sa.disabled_at is null
    where a.trigger_variant = ${started.trigger} and a.status = 'active' and a.deleted_at is null
      and a.live_version > 0`
  const runs: Array<string> = []
  for (const flow of flows) {
    for (const recordId of started.recordIds) {
      if (flow.storeScope !== null) {
        const [inScope] = yield* sql<{ id: string }>`
          select id from orders where id = ${recordId} and store_id in ${sql.in([...flow.storeScope, ""])}`
        if (inScope === undefined) continue
      }
      const [hour] = yield* sql<{ n: number }>`
        select count(*)::int as n from automation_runs
        where automation_id = ${flow.id} and status <> 'skipped' and started_at > now() - interval '1 hour'`
      const reason = flow.accountId === null
        ? "De flow heeft geen actief serviceaccount."
        : flow.rateLimit > 0 && (hour?.n ?? 0) >= flow.rateLimit
        ? `De limiet van ${flow.rateLimit} runs per uur is bereikt.`
        : null
      const id = mintId("run")
      const inserted = yield* sql<{ id: string }>`
        insert into automation_runs (id, workspace_id, automation_id, version, service_account_id, trigger_event,
                                     trigger_variant, summary, record_kind, record_id, status, reason, finished_at)
        values (${id}, ${flow.workspaceId}, ${flow.id}, ${flow.liveVersion}, ${flow.accountId}, ${outboxId},
                ${started.trigger}, ${started.summary}, ${started.recordKind}, ${recordId},
                ${reason === null ? "running" : "skipped"}, ${reason}, ${reason === null ? null : new Date()})
        on conflict (automation_id, trigger_event, record_id) do nothing
        returning id`
      if (inserted.length === 0) continue
      yield* sql`update automations set runs_total = runs_total + 1 where id = ${flow.id}`
      if (reason === null) runs.push(id)
    }
  }
  return runs
})

/* ── reading a run ─────────────────────────────────────────────────────────────────────────── */

const euro = (minor: number) =>
  (minor / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const regionName = (code: string) => {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/** What an order run's steps can read, as the fields `Fields.ts` names. */
export const orderContext = Effect.fn("Automations.orderContext")(function*(sql: SqlClient.SqlClient, orderId: string) {
  const [o] = yield* sql<{
    number: string
    totalMinor: string
    status: string
    customerName: string | null
    customerEmail: string | null
    country: string | null
    tags: Array<string>
    customerTags: Array<string> | null
    lifetimeValueMinor: string | null
  }>`
    select o.number, o.total_minor, o.status, o.customer_name, o.customer_email,
           o.shipping_address ->> 'country' as country, o.tags, c.tags as customer_tags, c.lifetime_value_minor
    from orders o left join customers c on c.id = o.customer_id
    where o.id = ${orderId}`
  if (o === undefined) return undefined
  const name = o.customerName ?? ""
  const context: Record<string, string> = {
    "order.number": o.number,
    "order.total": euro(Number(o.totalMinor)),
    "order.status": o.status,
    "order.country": o.country === null ? "" : regionName(o.country),
    "order.country_code": o.country ?? "",
    "order.tags": o.tags.join(", "),
    "customer.name": name,
    "customer.first_name": name.split(/\s+/)[0] ?? "",
    "customer.email": o.customerEmail ?? "",
    "customer.tags": (o.customerTags ?? []).join(", "),
    ...(o.lifetimeValueMinor === null ? {} : { "customer.lifetime_value": `€ ${euro(Number(o.lifetimeValueMinor))}` })
  }
  return context
})

/**
 * The run's plan, or `null` when there is nothing left to do: the run is closed, or the version it was pinned to is gone
 * (its first publication was undone), which closes it as stopped. A removed or paused flow is not checked here: every
 * action checks it again just before it runs (`actOnce`), so a run that waits days acts on the flow as it is then.
 */
export const loadRun = Effect.fn("Automations.loadRun")(function*(runId: string) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [r] = yield* sql<{
        workspaceId: string
        automationId: string
        name: string
        version: number
        startedAt: Date
        status: string
        summary: string
        recordKind: string
        recordId: string
        triggerEvent: string
        nodesJson: string | null
        storeScope: Array<string> | null
        accountId: string | null
        accountLabel: string | null
        accountVersion: number | null
        accountScopes: Array<string> | null
      }>`
        select r.workspace_id, r.automation_id, a.name, r.version, r.started_at, r.status, r.summary, r.record_kind, r.record_id,
               r.trigger_event, v.nodes::text as nodes_json, a.store_scope, sa.id as account_id, sa.label as account_label,
               sa.version as account_version, sa.scopes as account_scopes
        from automation_runs r
        join automations a on a.id = r.automation_id
        left join automation_versions v on v.automation_id = r.automation_id and v.version = r.version
        left join service_accounts sa on sa.id = r.service_account_id and sa.disabled_at is null
        where r.id = ${runId}`
      // Not there yet: the relay's transaction that wrote it has not committed. The step is tried again.
      if (r === undefined) return yield* new StepFailed({ explanation: "De run is er nog niet.", terminal: false })
      if (r.status !== "running" && r.status !== "waiting") return null
      if (r.nodesJson === null) {
        yield* sql`update automation_runs set status = 'stopped', reason = ${UNPUBLISHED}, finished_at = now()
                   where id = ${runId} and status in ('running', 'waiting')`
        return null
      }
      const context = r.recordKind === "order" ? yield* orderContext(sql, r.recordId) : {}
      const plan: RunPlan = {
        runId,
        workspaceId: r.workspaceId,
        automationId: r.automationId,
        name: r.name,
        version: r.version,
        runAt: r.startedAt.toISOString(),
        recordKind: r.recordKind,
        recordId: r.recordId,
        nodes: JSON.parse(r.nodesJson) as Flow,
        context: { "trigger.summary": `Bestelling ${context?.["order.number"] ?? ""} ${r.summary}`, ...context },
        account: r.accountId === null
          ? null
          : {
            id: r.accountId,
            label: r.accountLabel ?? "",
            version: r.accountVersion ?? 1,
            scopes: r.accountScopes ?? []
          },
        storeScope: r.storeScope,
        connected: [...(yield* connectedBrands(sql))],
        done: yield* doneBefore(sql, r.automationId, r.triggerEvent)
      }
      return plan
    })
  )
})

/**
 * A run started again ("Opnieuw") is `rerun:<key>:<n>`; the actions the earlier runs of that key did are not done
 * again, so a ticket made the first time is not made twice.
 */
export const keyOf = (run: { readonly id: string; readonly triggerEvent: string }) =>
  run.triggerEvent.startsWith("rerun:") ? run.triggerEvent.split(":")[1] ?? run.id : run.id

const doneBefore = Effect.fn("Automations.doneBefore")(function*(
  sql: SqlClient.SqlClient,
  automationId: string,
  triggerEvent: string
) {
  if (!triggerEvent.startsWith("rerun:")) return []
  const key = triggerEvent.split(":")[1] ?? ""
  const rows = yield* sql<{ nodeId: string }>`
    select distinct s.node_id from automation_run_steps s
    join automation_runs r on r.id = s.run_id
    where r.automation_id = ${automationId} and (r.id = ${key} or r.trigger_event like ${`rerun:${key}:%`})
      and s.status = 'succeeded' and s.variant like 'action.%'`
  return rows.map((r) => r.nodeId)
})

/** What the run read when it started, as the Runs drawer's Invoer shows it. */
export const inputOf = (context: RunContext): Record<string, string> => {
  const pick: Array<[string, string]> = [
    ["Bestelling", "order.number"],
    ["Klant", "customer.name"],
    ["E-mail", "customer.email"],
    ["Totaal", "order.total"],
    ["Land", "order.country"]
  ]
  return Object.fromEntries(
    pick.flatMap(([label, path]) => {
      const value = context[path] ?? ""
      return value === "" ? [] : [[label, path === "order.total" ? `€ ${value}` : value]]
    })
  )
}

export const UNPUBLISHED = "De publicatie is ongedaan gemaakt; de run is gestopt."

/* ── writing what a step did ───────────────────────────────────────────────────────────────── */

export interface StepRecord {
  readonly runId: string
  readonly runAt: string
  readonly nodeId: string
  readonly variant: string
  readonly attempt?: number
  readonly status: "succeeded" | "failed" | "skipped" | "waiting" | "stopped"
  readonly input?: Record<string, unknown>
  readonly output?: Record<string, unknown>
  readonly error?: string
  readonly explanation?: string
}

/** One step's row, written again by a retried attempt; the run says `waiting` while a step waits. */
export const recordStep = Effect.fn("Automations.recordStep")(function*(step: StepRecord) {
  const db = yield* Db
  yield* db.scopedFor((sql) => writeStep(sql, step))
})

const writeStep = (sql: SqlClient.SqlClient, step: StepRecord) =>
  Effect.gen(function*() {
    const [run] = yield* sql<
      { workspaceId: string }
    >`select workspace_id from automation_runs where id = ${step.runId}`
    if (run === undefined) return
    yield* sql`
        insert into automation_run_steps (workspace_id, run_id, run_at, node_id, attempt, variant, status, input,
                                          output, error, explanation, finished_at)
        values (${run.workspaceId}, ${step.runId}, ${new Date(step.runAt)}, ${step.nodeId}, ${step.attempt ?? 1},
                ${step.variant}, ${step.status}, ${JSON.stringify(step.input ?? {})}::jsonb,
                ${JSON.stringify(step.output ?? {})}::jsonb, ${step.error ?? null}, ${step.explanation ?? null},
                ${step.status === "waiting" ? null : new Date()})
        on conflict (run_id, node_id, attempt, run_at) do update set status = excluded.status,
          output = excluded.output, error = excluded.error, explanation = excluded.explanation,
          finished_at = excluded.finished_at`
    yield* sql`update automation_runs set status = ${step.status === "waiting" ? "waiting" : "running"}
                 where id = ${step.runId} and status in ('running', 'waiting')`
  })

/**
 * The run closed: succeeded, stopped by a condition or an answer, or failed. A failed run is told to whoever the flow's
 * settings name (else its owner), as a note once the relay delivers it.
 */
export const finishRun = Effect.fn("Automations.finishRun")(function*(
  runId: string,
  status: "succeeded" | "stopped" | "failed",
  reason: string | null
) {
  const db = yield* Db
  const outboxIds = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [run] = yield* sql<{ workspaceId: string; automationId: string; notify: string | null }>`
        update automation_runs r set status = ${status}, reason = ${reason}, finished_at = now()
        from automations a left join automation_settings s on s.automation_id = a.id
        where r.id = ${runId} and a.id = r.automation_id and r.status in ('running', 'waiting')
        returning r.workspace_id, r.automation_id, coalesce(s.notify_member_id, a.owner_member_id) as notify`
      if (run === undefined || status !== "failed" || run.notify === null) return []
      return [
        yield* Outbox.write(sql, run.workspaceId, {
          type: "automation.notify",
          workspaceId: run.workspaceId,
          userId: "system",
          kind: "failed",
          automationId: run.automationId,
          runId,
          memberIds: [run.notify],
          detail: reason ?? ""
        })
      ]
    })
  )
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds))
})

/* ── deciding and acting ───────────────────────────────────────────────────────────────────── */

/** A Filter's, a splitsing's, a country's or a label's answer for this record. */
export const decide = (variantId: string, config: Readonly<Record<string, unknown>>, context: RunContext): boolean => {
  const text = (key: string) => String(config[key] ?? "").trim()
  switch (variantId) {
    case "condition.country": {
      const want = text("country").toLowerCase()
      return want !== "" &&
        [context["order.country"], context["order.country_code"]].some((c) => (c ?? "").toLowerCase() === want)
    }
    case "condition.tag_match": {
      const want = text("tag").toLowerCase()
      const tags = `${context["order.tags"] ?? ""}, ${context["customer.tags"] ?? ""}`.toLowerCase().split(/\s*,\s*/)
      return want !== "" && tags.includes(want)
    }
    default:
      return holds(text("expression"), context)
  }
}

/** Why a step that is in the catalogue does not run today, in the run's history. */
export const notYet = (variantId: string, connected: ReadonlyArray<string>): string => {
  const step = STEPS_BY_ID[variantId]
  if (step?.brand !== undefined) {
    const name = BRAND_NAME[step.brand] ?? step.brand
    return connected.includes(step.brand)
      ? `${name}-stappen draaien in een volgende versie; deze stap is overgeslagen.`
      : `Koppel ${name} om deze stap te laten draaien; hij is overgeslagen.`
  }
  if (step?.ai === true) return "AI-stappen komen later; deze stap is overgeslagen."
  return `“${step?.label ?? variantId}” kan Insyte nog niet uitvoeren; de stap is overgeslagen.`
}

const TERMINAL = new Set(["Forbidden", "NotFound", "Invalid", "Conflict", "MemberNotActive"])

/** A slice's typed refusal as the run's explanation; terminal, as trying again gives the same answer. */
const explain = (variantId: string, error: unknown): StepFailed => {
  const tag = (error as { _tag?: string })._tag ?? ""
  const scope = STEPS_BY_ID[variantId]?.scope
  const explanation = tag === "Forbidden"
    ? `De flow mist het recht “${
      scope === undefined ? "?" : SCOPE_LABEL[scope] ?? scope
    }”. Zet het aan bij Instellingen.`
    : tag === "NotFound"
    ? "Het record van deze run bestaat niet meer, of valt buiten de winkels van de flow."
    : tag === "Invalid"
    ? `Een veld van de stap klopt niet (${Object.keys((error as { fields?: object }).fields ?? {}).join(", ")}).`
    : tag === "MemberNotActive"
    ? "De collega aan wie de stap toewijst, is niet meer actief."
    : tag === "Conflict"
    ? "Het record veranderde intussen; de stap is niet uitgevoerd."
    : "De stap lukte niet; Insyte probeert het opnieuw."
  return new StepFailed({ explanation, terminal: TERMINAL.has(tag) })
}

/** Active members whose name is `name` (case aside), for "Toewijzen aan" and "Wie". */
export const membersNamed = (sql: SqlClient.SqlClient, name: string) =>
  Effect.map(
    sql<{ id: string }>`
      select m.id from members m join auth."user" u on u.id = m.user_id
      where lower(u.name) = lower(${name}) and m.deactivated_at is null and m.removed_at is null`,
    (rows) => rows.map((r) => r.id)
  )

const PRIORITY: Record<string, "low" | "medium" | "high"> = { low: "low", normal: "medium", high: "high" }

/**
 * One action, carried out through its slice as the flow's service account: a ticket (`Tickets.create`), a customer's
 * label (`Customers.tag`), a note to a teammate, an event in the run's history. What the record does not have is said,
 * not guessed.
 */
export const act = Effect.fn("Automations.act")(function*(
  plan: RunPlan,
  node: { readonly id: string; readonly variantId: string; readonly config: Readonly<Record<string, unknown>> }
) {
  if (plan.account === null) {
    return yield* new StepFailed({ explanation: "De flow staat uit of heeft geen serviceaccount.", terminal: true })
  }
  const missing = missingIn(node.config, plan.context)
  if (missing.length > 0) {
    return yield* new StepFailed({
      explanation: `Deze run heeft geen ${missing.map((m) => `{{${m}}}`).join(", ")}.`,
      terminal: true
    })
  }
  const text = (key: string) => fill(String(node.config[key] ?? ""), plan.context).trim()
  const principal = principalOf(plan.workspaceId, plan.account, plan.storeScope)
  const workspaceId = plan.workspaceId
  const db = yield* Db
  const asAccount = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(CurrentPrincipal, principal))
  const refuse = (error: unknown) => Effect.fail(explain(node.variantId, error))

  switch (node.variantId) {
    case "action.create_ticket": {
      const tickets = yield* TicketsService
      const assignee = text("assignee")
      const assigneeIds = assignee === ""
        ? []
        : yield* asAccount(db.scoped((sql) => membersNamed(sql, assignee)))
      const queue = String(node.config["queue"] ?? "intake")
      const change = yield* asAccount(tickets.create({
        title: text("title") || plan.name,
        description: `Aangemaakt door de automatisering “${plan.name}”.`,
        status: queue === "in_progress" ? "in_progress" : "intake",
        priority: PRIORITY[String(node.config["priority"] ?? "normal")] ?? "medium",
        assigneeIds: assigneeIds.slice(0, 1),
        labels: queue === "disputes" ? ["automatisering", "geschil"] : ["automatisering"],
        ...(plan.recordKind === "order" ? { related: { type: "order" as const, id: plan.recordId } } : {})
      })).pipe(Effect.catch(refuse))
      return {
        status: "succeeded" as const,
        output: { ticketIds: change.tickets.map((t) => t.id), assigned: assigneeIds.length > 0 },
        explanation: assignee !== "" && assigneeIds.length === 0
          ? `Ticket gemaakt; niemand heet “${assignee}”, dus het is niet toegewezen.`
          : "Ticket gemaakt."
      }
    }
    case "action.tag_customer": {
      const customers = yield* CustomersService
      const [order] = plan.recordKind === "order"
        ? yield* db.scopedFor((sql) =>
          sql<{ customerId: string | null }>`select customer_id from orders where id = ${plan.recordId}`
        )
        : []
      if (order?.customerId == null) {
        return {
          status: "skipped" as const,
          output: {},
          explanation: "Deze bestelling heeft geen klant om te labelen."
        }
      }
      yield* asAccount(customers.tag({ ids: [order.customerId], add: [text("tag")], remove: [] })).pipe(
        Effect.catch(refuse)
      )
      return { status: "succeeded" as const, output: { customerId: order.customerId, tag: text("tag") } }
    }
    case "action.alert_team": {
      if (!principal.role.levels.team) {
        return yield* new StepFailed({
          explanation: explain(node.variantId, { _tag: "Forbidden" }).explanation,
          terminal: true
        })
      }
      const who = text("team")
      const outboxIds = yield* db.scopedFor((sql) =>
        Effect.gen(function*() {
          const named = yield* membersNamed(sql, who)
          const [owner] = named.length > 0
            ? []
            : yield* sql<
              { id: string | null }
            >`select owner_member_id as id from automations where id = ${plan.automationId}`
          const memberIds = named.length > 0 ? named : owner?.id == null ? [] : [owner.id]
          if (memberIds.length === 0) return { memberIds, outboxIds: [] }
          return {
            memberIds,
            outboxIds: [
              yield* Outbox.write(sql, workspaceId, {
                type: "automation.notify",
                workspaceId,
                userId: "system",
                kind: "alert",
                automationId: plan.automationId,
                runId: plan.runId,
                memberIds,
                detail: `${plan.context["trigger.summary"] ?? ""} · ${String(node.config["urgency"] ?? "high")}`
              })
            ]
          }
        })
      )
      yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds.outboxIds))
      return {
        status: outboxIds.memberIds.length > 0 ? "succeeded" as const : "skipped" as const,
        output: { memberIds: outboxIds.memberIds },
        explanation: outboxIds.memberIds.length > 0
          ? undefined
          : `Niemand heet “${who}” en de flow heeft geen eigenaar; er ging geen melding uit.`
      }
    }
    case "action.track_event":
      return { status: "succeeded" as const, output: { event: text("event") || "automation.fired" } }
    default:
      return { status: "skipped" as const, output: {}, explanation: notYet(node.variantId, plan.connected) }
  }
})

/** What an action step came to: done (now, or by an earlier attempt), or the run is to stop before it acts. */
export type ActOutcome =
  | {
    readonly kind: "done"
    readonly status: "succeeded" | "skipped"
    readonly output: Record<string, unknown>
    readonly explanation?: string | undefined
  }
  | { readonly kind: "stop"; readonly reason: string }

const stop = (reason: string) => ({ stop: reason }) as const

/**
 * The flow as it is now, for the action about to run: the run still open, the flow on and not removed, the version it
 * was pinned to still there, and its account enabled, with the rights and stores it holds today. A run that waited days
 * acts as the flow is when it wakes, never as it was when it started.
 */
const liveOf = Effect.fn("Automations.liveOf")(function*(sql: SqlClient.SqlClient, plan: RunPlan) {
  const [f] = yield* sql<{
    runStatus: string
    status: string
    removed: boolean
    storeScope: Array<string> | null
    pinned: number | null
    accountId: string | null
    label: string | null
    accountVersion: number | null
    scopes: Array<string> | null
    disabled: boolean | null
  }>`
    select r.status as run_status, a.status, a.deleted_at is not null as removed, a.store_scope, v.version as pinned,
           sa.id as account_id, sa.label, sa.version as account_version, sa.scopes, sa.disabled_at is not null as disabled
    from automation_runs r
    join automations a on a.id = r.automation_id
    left join automation_versions v on v.automation_id = a.id and v.version = r.version
    left join service_accounts sa on sa.automation_id = a.id
    where r.id = ${plan.runId}
    for share of r`
  if (f === undefined || (f.runStatus !== "running" && f.runStatus !== "waiting")) return stop("Gestopt.")
  if (f.removed) return stop("De flow is verwijderd; de rest van de run is niet gedaan.")
  if (f.pinned === null) return stop(UNPUBLISHED)
  if (f.status !== "active") return stop("De flow staat uit; de rest van de run is niet gedaan.")
  if (f.accountId === null || f.disabled === true) {
    return stop("De flow heeft geen actief serviceaccount meer; de rest van de run is niet gedaan.")
  }
  return {
    account: { id: f.accountId, label: f.label ?? "", version: f.accountVersion ?? 1, scopes: f.scopes ?? [] },
    storeScope: f.storeScope
  } as const
})

/**
 * One action step, once: in one transaction, the flow is read as it is now (`liveOf`), the action runs through its
 * slice as the account it holds today, and the step's row is written. A retried attempt (Workflows retries a step whose
 * answer it did not keep) finds that row and does not act again; an attempt that failed left nothing behind. What the
 * slice's own events say may wait for the relay's minute sweep, as they commit with the step.
 */
export const actOnce = Effect.fn("Automations.actOnce")(function*(
  plan: RunPlan,
  node: { readonly id: string; readonly variantId: string; readonly config: Readonly<Record<string, unknown>> },
  attempt: number
) {
  const db = yield* Db
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [done] = yield* sql<{ status: "succeeded" | "skipped"; outputJson: string; explanation: string | null }>`
        select status, output::text as output_json, explanation from automation_run_steps
        where run_id = ${plan.runId} and node_id = ${node.id} and status in ('succeeded', 'skipped')
        order by attempt desc limit 1`
      if (done !== undefined) {
        return {
          kind: "done",
          status: done.status,
          output: JSON.parse(done.outputJson) as Record<string, unknown>,
          explanation: done.explanation ?? undefined
        } satisfies ActOutcome as ActOutcome
      }
      const live = yield* liveOf(sql, plan)
      if ("stop" in live) return { kind: "stop", reason: live.stop } satisfies ActOutcome as ActOutcome
      const did = yield* act({ ...plan, account: live.account, storeScope: live.storeScope }, node)
      yield* writeStep(sql, {
        runId: plan.runId,
        runAt: plan.runAt,
        nodeId: node.id,
        variant: node.variantId,
        attempt,
        status: did.status,
        input: { ...node.config },
        output: did.output,
        ...(did.explanation === undefined ? {} : { explanation: did.explanation })
      })
      return { kind: "done", ...did } satisfies ActOutcome as ActOutcome
    })
  )
})

/** Whether the run's customer wrote in since the run started ("Wachten op antwoord"). */
export const repliedSince = Effect.fn("Automations.repliedSince")(function*(plan: RunPlan) {
  const email = plan.context["customer.email"] ?? ""
  if (email === "") return false
  const db = yield* Db
  const [hit] = yield* db.scopedFor((sql) =>
    sql<{ id: string }>`
      select id from email_messages
      where direction = 'inbound' and lower(from_address) = lower(${email}) and created_at > ${new Date(plan.runAt)}
      limit 1`
  )
  return hit !== undefined
})

import { Db } from "@insyte/database/Db"
import { AGENT_UNDO_SECONDS, type AgentActionId } from "@insyte/domain/AgentActions"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { AREA_IDS, type AreaId, type Level, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { OfflinePlan } from "../../first-analysis/domain/FirstAnalysis.ts"
import { IssuedUndo, logUntil, UndoWindow } from "../../shared/domain/Undo.ts"
import { heldForTeam } from "../domain/Triggers.ts"
import { decide } from "./autonomy.ts"
import { record } from "./log.ts"

/*
 * The agent acting on its own (M15 step 6; ADR-0027 "started by an event"): a mail in, an order delayed, and the
 * workspace's own agent does what the autonomy rules let it, as itself (`actor_kind = agent`), within its scopes and
 * its stores. Every trigger is claimed once (its touchpoint), so a relay or queue that delivers it twice acts once.
 * Then, in order: Nooit, or a record outside the agent's stores, does nothing and is logged as refused; Eerst vragen,
 * the plan's hours, a spent budget or a draft that may not go alone leave what Insyte prepared for a person (the
 * inbox's draft card, the queue's plate on Start) and are logged as asked; Zelf doen runs the use case a person's
 * button runs, with its sends held for the log's five minutes, and logs it with its way back.
 *
 * The slices' own use cases are the caller's (`platform/AgentSink.ts`); this is the only way the agent runs them.
 */

const LEVELS_OFF = Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, Level>
const SPECIALS_OFF = Object.fromEntries(SPECIAL_IDS.map((s) => [s, false])) as Record<SpecialId, boolean>

/**
 * What the agent may touch, whatever its policy: answering customers and telling a shopper of a delay, the two things
 * it does on its own today. A level at Zelf doen still needs this (ADR-0027: the policy and the scopes, both).
 */
const AGENT_LEVELS: Partial<Record<AreaId, Level>> = { support: 2, orders: 2 }

const decodeStores = Schema.decodeUnknownOption(Schema.Array(Schema.String))

/**
 * The workspace's own agent (`agents`, one per workspace, made on first need) as the principal it acts as: the areas
 * it needs, no specials, no refund, and the stores its scopes name (`scopes.stores`; every store where none are named).
 */
export const agentPrincipal = Effect.fn("Agent.principal")(function*() {
  const db = yield* Db
  const workspace = yield* CurrentWorkspace
  const row = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into agents (id, workspace_id) values (${mintId("agt")}, app_workspace_id())
                 on conflict (workspace_id) do nothing`
      const [a] = yield* sql<{ id: string; stores: unknown }>`
        select id, scopes -> 'stores' as stores from agents where workspace_id = app_workspace_id()`
      return a!
    })
  )
  const stores = Option.getOrNull(decodeStores(row.stores))
  return {
    kind: "agent",
    id: row.id,
    userId: null,
    workspaceId: workspace.id as WorkspaceId,
    partnerId: null,
    role: {
      id: "agent",
      label: "Insyte",
      version: 1,
      levels: { ...LEVELS_OFF, ...AGENT_LEVELS },
      specials: SPECIALS_OFF,
      refundLimit: 0,
      stores: stores === null ? "all" : [...stores]
    },
    storeScope: stores
  } satisfies Principal as Principal
})

/**
 * Whether the offline plan keeps `action` for the team now (`heldForTeam`), read as the system: an agent's own
 * principal reads no policy table.
 */
const teamHolds = (action: AgentActionId) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ plan: unknown; timezone: string | null }>`
          select f.offline as plan, w.timezone
          from first_analyses f join workspaces w on w.id = f.workspace_id
          where f.offline is not null order by f.offline_at desc nulls last limit 1`
        if (row === undefined) return false
        const [last] = yield* sql<{ version: number; changedAt: Date }>`
          select v.version, v.changed_at from autonomy_policy_versions v
          where v.diff @> ${JSON.stringify([{ id: action }])}::jsonb order by v.version desc limit 1`
        const plan = Option.getOrNull(Schema.decodeUnknownOption(OfflinePlan)(row.plan))
        const changed = last === undefined ? null : { version: last.version, at: last.changedAt.getTime() }
        return heldForTeam(plan, action, changed, row.timezone ?? "Europe/Amsterdam", new Date())
      })
    ))

/**
 * A run of the day for an action with a limit per day (Limieten), claimed before it runs: one touchpoint per slot of
 * the day, so two triggers acting at once cannot both take the last one. `true` when a slot was free, or there is no
 * limit.
 */
const daySlot = (action: AgentActionId, id: string) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ perDay: number | null; day: string }>`
          select (select (p.limits -> ${action} ->> 'perDay')::int from autonomy_policies p) as per_day,
                 to_char(now() at time zone coalesce(w.timezone, 'Europe/Amsterdam'), 'YYYY-MM-DD') as day
          from workspaces w where w.id = app_workspace_id()`
        if (row === undefined || row.perDay === null) return true
        for (let n = 1; n <= row.perDay; n++) {
          const taken = yield* sql`
            insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
            values (app_workspace_id(), ${`slot:${action}:${row.day}:${n}`}, ${id})
            on conflict do nothing returning dedupe_key`
          if (taken.length > 0) return true
        }
        return false
      })
    ))

/** What a trigger prepared for either way (the reply's text), or why there is nothing to go on. */
export type Prepared<P> =
  | { readonly _tag: "Ready"; readonly value: P }
  | { readonly _tag: "Held"; readonly reason: "budget" | "unknown" }

/**
 * What a run answers when, at the moment it would send, the record is no longer the agent's to act on: the thread
 * taken by the team or answered meanwhile (`taken`, nothing done), or the agent's mails to this address for the day
 * used (`limit`, the draft left for the team). Checked on the send's own transaction, after its lock.
 */
export interface StoodDown {
  readonly _tag: "StoodDown"
  readonly reason: "taken" | "limit"
}

export const standDown = (reason: StoodDown["reason"]): StoodDown => ({ _tag: "StoodDown", reason })

const isStoodDown = (a: unknown): a is StoodDown =>
  typeof a === "object" && a !== null && "_tag" in a && a._tag === "StoodDown"

/** Asked first for a reason no draft can change: no model is asked for one. */
const UNPREPARED = new Set(["disabled", "locked", "budget", "unknown"])

export interface Trigger<P, A, E, R> {
  readonly action: AgentActionId
  /** The trigger, once: the outbox event and what it is about. */
  readonly dedupeKey: string
  /** The store of the record it is about, which the agent's stores must reach; `null` for one of no store. */
  readonly storeId: string | null
  readonly subject: { readonly type: string; readonly id: string; readonly label: string }
  readonly trigger: { readonly kind: string; readonly label: string }
  /** One line in Dutch: why it acted ("Een klant vroeg waar de bestelling is."). */
  readonly reason: string
  /** One line in Dutch, as the log says it ("Klant geantwoord over bestelling #1042"). */
  readonly sentence: string
  readonly before?: string | null
  readonly after?: string | null
  readonly sources: ReadonlyArray<{ kind: string; title: string; detail: string; to: string | null }>
  /** What both ways need first; on Eerst vragen it is what the person finds (the inbox's draft). */
  readonly prepare: Effect.Effect<Prepared<P>, never, R>
  /** Whether it may go without a person; a draft that may not waits for the team (`guard`). */
  readonly safe: (prepared: P) => boolean
  readonly model: (prepared: P) => { readonly name: string; readonly promptVersion: string } | null
  /** Zelf doen: the use case a person's button runs, as the agent; or why, at the last moment, it is not its to run. */
  readonly run: (prepared: P, actionId: string) => Effect.Effect<A | StoodDown, E, R>
}

export type Acted = "ran" | "proposed" | "refused" | "failed" | "seen"

const tagOf = (cause: Cause.Cause<unknown>) => {
  const e = Option.getOrUndefined(Cause.findErrorOption(cause))
  return typeof e === "object" && e !== null && "_tag" in e && typeof e._tag === "string" ? e._tag : "failed"
}

/** One trigger, as the workspace's agent (`CurrentPrincipal` is `agentPrincipal`'s): what happened, logged. */
export const act = <P, A, E, R>(t: Trigger<P, A, E, R>) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    const db = yield* Db
    const id = mintId("aga")
    // Claimed before anything is done: a second delivery finds it and stops, even while the first is still out.
    const claimed = yield* db.scoped((sql) =>
      sql`insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
          values (app_workspace_id(), ${t.dedupeKey}, ${id}) on conflict do nothing returning dedupe_key`
    )
    if (claimed.length === 0) return "seen" as Acted

    const d = yield* db.scoped((sql) => decide(sql, t.action, null))
    const write = (row: {
      readonly decision: "run" | "propose" | "refuse"
      readonly outcome: "done" | "failed" | "proposed" | "refused"
      readonly refuseReason: string | null
      readonly error?: string
      readonly model?: { readonly name: string; readonly promptVersion: string } | null
      readonly undo?: { readonly hash: string; readonly until: Date } | null
    }) =>
      db.scoped((sql) =>
        record(sql, {
          id,
          action: t.action,
          input: null,
          storeId: t.storeId,
          subject: t.subject,
          trigger: t.trigger,
          policyVersion: d.policyVersion,
          level: d.level,
          decision: row.decision,
          refuseReason: row.refuseReason,
          reason: t.reason,
          sentence: t.sentence,
          before: t.before ?? null,
          after: t.after ?? null,
          effect: row.outcome === "done" ? { kind: "token" } : null,
          outcome: row.outcome,
          error: row.error ?? null,
          proposalId: null,
          undo: row.undo ?? null,
          dedupeKey: t.dedupeKey,
          sources: t.sources,
          model: row.model ?? null
        })
      )

    if (d.decision === "refuse") {
      yield* write({ decision: "refuse", outcome: "refused", refuseReason: d.reason ?? "policy" })
      return "refused" as Acted
    }
    // A record in a store the agent does not reach is not its to act on, whatever the policy says.
    if (principal.storeScope !== null && t.storeId !== null && !principal.storeScope.includes(t.storeId)) {
      yield* write({ decision: "refuse", outcome: "refused", refuseReason: "scope" })
      return "refused" as Acted
    }
    // Switched off, an action it may never run alone, a spent budget: asked, and no model asked for a draft.
    if (d.decision === "propose" && UNPREPARED.has(d.reason ?? "")) {
      yield* write({ decision: "propose", outcome: "proposed", refuseReason: d.reason })
      return "proposed" as Acted
    }
    const hours = d.decision === "run" && (yield* teamHolds(t.action))
    const prepared = yield* t.prepare
    if (prepared._tag === "Held") {
      yield* write({ decision: "propose", outcome: "proposed", refuseReason: prepared.reason })
      return "proposed" as Acted
    }
    const p = prepared.value
    const model = t.model(p)
    const asks = d.decision === "propose" ? d.reason ?? "policy" : hours ? "hours" : t.safe(p) ? null : "guard"
    if (asks !== null) {
      yield* write({ decision: "propose", outcome: "proposed", refuseReason: asks, model })
      return "proposed" as Acted
    }
    // The day's limit, claimed: a second trigger at the same moment finds the last slot taken.
    if (!(yield* daySlot(t.action, id))) {
      yield* write({ decision: "propose", outcome: "proposed", refuseReason: "limit", model })
      return "proposed" as Acted
    }

    // Zelf doen: the command as the agent; its undo token kept for the log, its sends held for the log's window.
    const issued: Array<{ readonly hash: string; readonly command: string; readonly until: number }> = []
    const ran = yield* Effect.exit(
      t.run(p, id).pipe(
        Effect.provideService(IssuedUndo, { add: (token) => void issued.push(token) }),
        Effect.provideService(UndoWindow, AGENT_UNDO_SECONDS)
      )
    )
    if (Exit.isFailure(ran)) {
      yield* Effect.logWarning("the agent's action did not run", { action: t.action, cause: ran.cause })
      yield* write({ decision: "run", outcome: "failed", refuseReason: null, error: tagOf(ran.cause), model })
      return "failed" as Acted
    }
    if (isStoodDown(ran.value)) {
      const stood = ran.value
      yield* stood.reason === "taken"
        ? write({ decision: "refuse", outcome: "refused", refuseReason: "taken", model })
        : write({ decision: "propose", outcome: "proposed", refuseReason: "limit", model })
      return stood.reason === "taken" ? "refused" as Acted : "proposed" as Acted
    }
    const token = issued[0]
    yield* write({
      decision: "run",
      outcome: "done",
      refuseReason: null,
      model,
      undo: token === undefined ? null : { hash: token.hash, until: logUntil(token) }
    })
    return "ran" as Acted
  })

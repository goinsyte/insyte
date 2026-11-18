import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  SESSION_MINUTES,
  type StaffRefusal,
  StaffRefused,
  type StaffSession,
  type WorkspaceHealth,
  type WorkspaceHit
} from "../domain/Support.ts"

/*
 * The team's side of Insyte-support (M18; the staff admin at `/api/__admin`): `staff` is the person of the team the
 * request came from, their address as Cloudflare Access vouched for it and the staff allowlist admitted (the transport
 * checks both before anything here runs). Everything they do is written to `staff_audit`; a start, a read and an end
 * of looking along also to the workspace's Logboek (`audit_events`, actor `insyte`, section `support`), in the same
 * transaction as the session's row, and before the read itself runs, so nothing is read unrecorded.
 *
 * Reads go through `Db.asStaff`, a read-only transaction; writes through `Db.recordAsStaff`, and only to the sessions
 * and the two audit trails (0107 holds `staff` to those and refuses it the sealed secrets).
 */

type Outcome = "ok" | "refused" | "failed"

interface StaffAuditLine {
  readonly action: "workspaces.search" | "workspace.health" | "session.start" | "session.read" | "session.end"
  readonly workspaceId?: string | null
  readonly sessionId?: string | null
  readonly rpc?: string | null
  readonly outcome: Outcome
  readonly code?: string | null
  readonly detail?: string | null
}

const iso = (d: Date | null | undefined) => (d === null || d === undefined ? null : d.toISOString())

const clip = (text: string | null | undefined, max: number) =>
  text === null || text === undefined ? null : text.length > max ? text.slice(0, max) : text

const auditLine = (sql: SqlClient.SqlClient, staff: string, line: StaffAuditLine) =>
  sql`insert into staff_audit (id, staff_email, action, workspace_id, session_id, rpc, outcome, code, detail)
      values (${mintId("sta")}, ${staff}, ${line.action}, ${line.workspaceId ?? null}, ${line.sessionId ?? null},
              ${clip(line.rpc, 120)}, ${line.outcome}, ${clip(line.code, 80)}, ${clip(line.detail, 300)})`

/** One line in the workspace's Logboek, as Insyte-support, and the realtime nudge for its banner. */
const logbook = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  sessionId: string,
  action: "support.session_started" | "support.read" | "support.session_ended",
  said: string
) =>
  Effect.gen(function*() {
    yield* sql`insert into audit_events
               (id, workspace_id, actor_kind, actor_id, action, subject_type, subject_id, section, diff)
               values (${mintId("aud")}, ${workspaceId}, 'insyte', ${sessionId}, ${action}, 'support', ${sessionId},
                       'support', ${JSON.stringify({ said })}::jsonb)`
    if (action !== "support.read") {
      yield* Outbox.write(sql, workspaceId, { type: "records.changed", workspaceId, kind: "support", ids: [sessionId] })
    }
  })

/** Writes a refusal to the team's audit, then fails with it. */
const refuse = (staff: string, line: Omit<StaffAuditLine, "outcome" | "code">, code: StaffRefusal) =>
  Effect.flatMap(
    Effect.service(Db),
    (db) => db.recordAsStaff(staff, null)((sql) => auditLine(sql, staff, { ...line, outcome: "refused", code }))
  ).pipe(Effect.andThen(Effect.fail(new StaffRefused({ code }))))

/* ── finding a workspace ─────────────────────────────────────────────────────────────────────── */

interface HitRow {
  readonly id: string
  readonly name: string
  readonly plan: string
  readonly createdAt: Date
  readonly stores: number
  readonly members: number
  readonly openIncidents: number
  readonly billing: string | null
  readonly supportAccessUntil: Date | null
}

const ATTENTION_BILLING = new Set(["past_due", "unpaid", "incomplete", "incomplete_expired"])

const hitOf = (row: HitRow): WorkspaceHit => ({
  id: row.id,
  name: row.name,
  plan: row.plan,
  createdAt: row.createdAt.toISOString(),
  stores: row.stores,
  members: row.members,
  openIncidents: row.openIncidents,
  billing: row.billing,
  health: row.openIncidents > 0 || (row.billing !== null && ATTENTION_BILLING.has(row.billing)) ? "attention" : "ok",
  consentUntil: row.supportAccessUntil !== null && row.supportAccessUntil.getTime() > Date.now()
    ? row.supportAccessUntil.toISOString()
    : null
})

/** By id, a part of the name or a shop domain, or the owner's address in full; at most 20, newest first. */
export const find = Effect.fn("Staff.find")(function*(staff: string, query: string) {
  const q = query.trim().slice(0, 200)
  const db = yield* Db
  const rows = q.length < 2
    ? []
    : yield* db.asStaff(staff, null)((sql) => sql<HitRow>`select * from staff_find_workspaces(${q})`)
  // The query is kept as typed: who looked for whom is the point of the audit.
  yield* db.recordAsStaff(staff, null)((sql) =>
    auditLine(sql, staff, { action: "workspaces.search", outcome: "ok", detail: q, code: `${rows.length}` })
  )
  return rows.map(hitOf)
})

/* ── a workspace's health ────────────────────────────────────────────────────────────────────── */

/** Ten minutes due and not gone out: its delivery failed, and the queue retries it or holds it as a dead letter. */
const STUCK_MINUTES = 10

const healthOf = (sql: SqlClient.SqlClient, workspaceId: WorkspaceId) =>
  Effect.gen(function*() {
    const [hit] = yield* sql<HitRow>`
      select w.id, w.name, w.plan, w.created_at, w.support_access_until,
             (select count(*)::int from stores s where s.workspace_id = w.id and s.status <> 'disconnected')
               as stores,
             (select count(*)::int from members m
               where m.workspace_id = w.id and m.removed_at is null and m.deactivated_at is null) as members,
             (select count(*)::int from connection_incidents i where i.workspace_id = w.id and i.resolved_at is null)
               as open_incidents,
             (select s.status from subscriptions s where s.workspace_id = w.id) as billing
      from workspaces w where w.id = ${workspaceId} and w.deleted_at is null`
    if (hit === undefined) return undefined
    const connections = yield* sql<{
      id: string
      provider: string
      status: string
      failures: number
      failure: string | null
      lastSyncedAt: Date | null
    }>`
      select id, provider, status, coalesce((health ->> 'failures')::int, 0) as failures,
             health ->> 'failure' as failure, last_synced_at
      from connections where workspace_id = ${workspaceId} order by created_at`
    const incidents = yield* sql<{ connectionId: string; kind: string; openedAt: Date }>`
      select connection_id, kind, opened_at from connection_incidents
      where workspace_id = ${workspaceId} and resolved_at is null order by opened_at`
    const stores = yield* sql<{ id: string; shopDomain: string; lastOrderHookAt: Date | null; connectionId: string }>`
      select id, shop_domain, last_order_hook_at, connection_id from stores
      where workspace_id = ${workspaceId} and status <> 'disconnected' order by created_at`
    const [outbox] = yield* sql<{ pending: number; lagSeconds: number | null; stuck: number }>`
      select count(*)::int as pending,
             extract(epoch from now() - min(coalesce(not_before, created_at))
               filter (where coalesce(not_before, created_at) <= now()))::int as lag_seconds,
             count(*) filter (where coalesce(not_before, created_at) < now() - make_interval(mins => ${STUCK_MINUTES}))::int
               as stuck
      from outbox where workspace_id = ${workspaceId} and relayed_at is null and cancelled_at is null`
    const [ai] = yield* sql<{ limitMinor: string | null; used: string | null }>`
      select (select monthly_limit_minor from ai_budgets where workspace_id = ${workspaceId} and member_id is null)
               as limit_minor,
             ai_month_used(null) as used`
    const [billing] = yield* sql<{
      plan: string
      status: string | null
      trialEndsAt: Date | null
      currentPeriodEnd: Date | null
      cancelAt: Date | null
    }>`
      select w.plan, s.status, w.trial_ends_at, s.current_period_end, s.cancel_at
      from workspaces w left join subscriptions s on s.workspace_id = w.id where w.id = ${workspaceId}`
    // Codes only: an HTTP status, an outcome, an incident's kind; never a body, a message or a reason's text.
    const errors = yield* sql<{ source: string; code: string; count: number; lastAt: Date }>`
      select source, code, count(*)::int as count, max(at) as last_at from (
        select 'webhook' as source, coalesce(status::text, 'no_response') as code, created_at as at
          from webhook_deliveries
          where workspace_id = ${workspaceId} and outcome = 'failed' and created_at > now() - interval '7 days'
        union all
        select 'automation', 'run_failed', started_at from automation_runs
          where workspace_id = ${workspaceId} and status = 'failed' and started_at > now() - interval '7 days'
        union all
        select 'ai', outcome, created_at from model_calls
          where workspace_id = ${workspaceId} and outcome <> 'ok' and created_at > now() - interval '7 days'
        union all
        select 'sync', kind, opened_at from connection_incidents
          where workspace_id = ${workspaceId} and opened_at > now() - interval '7 days'
      ) e group by source, code order by max(at) desc limit 50`
    const gaps = new Set(incidents.filter((i) => i.kind === "webhook_gap").map((i) => i.connectionId))
    return {
      workspace: hitOf(hit),
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        failures: c.failures,
        failure: c.failure,
        lastSyncedAt: iso(c.lastSyncedAt),
        incidents: incidents.filter((i) => i.connectionId === c.id).map((i) => ({
          kind: i.kind,
          openedAt: i.openedAt.toISOString()
        }))
      })),
      webhookGaps: stores.map((s) => ({
        storeId: s.id,
        shopDomain: s.shopDomain,
        lastOrderHookAt: iso(s.lastOrderHookAt),
        open: gaps.has(s.connectionId)
      })),
      outbox: { pending: outbox?.pending ?? 0, lagSeconds: outbox?.lagSeconds ?? null, stuck: outbox?.stuck ?? 0 },
      ai: {
        limitEuros: ai?.limitMinor === null || ai?.limitMinor === undefined
          ? null
          : Math.round(Number(ai.limitMinor) / 100),
        usedEuros: Math.round(Number(ai?.used ?? 0) / 10_000) / 100
      },
      billing: {
        plan: billing?.plan ?? hit.plan,
        status: billing?.status ?? null,
        trialEndsAt: iso(billing?.trialEndsAt),
        currentPeriodEnd: iso(billing?.currentPeriodEnd),
        cancelAt: iso(billing?.cancelAt)
      },
      errors: errors.map((e) => ({ source: e.source, code: e.code, count: e.count, lastAt: e.lastAt.toISOString() }))
    } satisfies WorkspaceHealth
  })

/** A workspace's health: needs no consent, it holds no shopper's data and no content. */
export const health = Effect.fn("Staff.health")(function*(staff: string, workspaceId: WorkspaceId) {
  const db = yield* Db
  const found = yield* db.asStaff(staff, workspaceId)((sql) => healthOf(sql, workspaceId))
  if (found === undefined) {
    return yield* refuse(staff, { action: "workspace.health", workspaceId }, "workspace_not_found")
  }
  yield* db.recordAsStaff(staff, null)((sql) =>
    auditLine(sql, staff, { action: "workspace.health", workspaceId, outcome: "ok" })
  )
  return found
})

/* ── looking along ───────────────────────────────────────────────────────────────────────────── */

interface SessionRow {
  readonly id: string
  readonly workspaceId: WorkspaceId
  readonly reason: string
  readonly startedAt: Date
  readonly expiresAt: Date
  readonly endedAt: Date | null
}

const sessionOf = (row: SessionRow): StaffSession => ({
  id: row.id,
  workspaceId: row.workspaceId,
  reason: row.reason,
  startedAt: row.startedAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  endedAt: iso(row.endedAt)
})

/** The consent as it stands: why not, or nothing when it holds. */
const consentOf = (sql: SqlClient.SqlClient, workspaceId: WorkspaceId) =>
  Effect.map(
    sql<{ until: Date | null; on: boolean }>`
      select support_access_until as until, coalesce(support_access_until > now(), false) as on
      from workspaces where id = ${workspaceId} and deleted_at is null`,
    ([row]): StaffRefusal | "workspace_not_found" | undefined =>
      row === undefined
        ? "workspace_not_found"
        : row.on
        ? undefined
        : row.until === null
        ? "no_consent"
        : "consent_expired"
  )

/**
 * A session of looking along, with a reason, for at most `SESSION_MINUTES` and never past the consent: only while
 * the owner's consent holds (checked here, and by the database when the row is written).
 */
export const start = Effect.fn("Staff.start")(function*(staff: string, workspaceId: WorkspaceId, reason: string) {
  const why = reason.trim()
  if (why.length < 3 || why.length > 500) {
    return yield* refuse(staff, { action: "session.start", workspaceId }, "reason_required")
  }
  const db = yield* Db
  const refused = yield* db.asStaff(staff, workspaceId)((sql) => consentOf(sql, workspaceId))
  if (refused !== undefined) return yield* refuse(staff, { action: "session.start", workspaceId }, refused)
  const id = mintId("sts")
  const row = yield* db.recordAsStaff(staff, workspaceId)((sql) =>
    Effect.gen(function*() {
      const [session] = yield* sql<SessionRow>`
        insert into staff_sessions (id, workspace_id, staff_email, reason, expires_at)
        select ${id}, w.id, ${staff}, ${why},
               least(now() + make_interval(mins => ${SESSION_MINUTES}), w.support_access_until)
        from workspaces w where w.id = ${workspaceId}
        returning id, workspace_id, reason, started_at, expires_at, ended_at`
      yield* auditLine(sql, staff, { action: "session.start", workspaceId, sessionId: id, outcome: "ok" })
      yield* logbook(sql, workspaceId, id, "support.session_started", `Meekijken gestart. Reden: ${why}`)
      return session!
    })
  )
  return sessionOf(row)
})

/** One's own session by its id, in whatever state: the team's, only its own (0107 `staff_sessions_own`). */
const own = (staff: string, sessionId: string) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.asStaff(staff, null)((sql) =>
      sql<SessionRow>`
        select id, workspace_id, reason, started_at, expires_at, ended_at from staff_sessions
        where id = ${sessionId} and staff_email = ${staff}`
    )).pipe(Effect.map(([row]) => row))

export const session = Effect.fn("Staff.session")(function*(staff: string, sessionId: string) {
  const row = yield* own(staff, sessionId)
  if (row === undefined) return yield* new StaffRefused({ code: "no_session" })
  return sessionOf(row)
})

/** Why a session may not read now: ended, past its hour, or the consent withdrawn or run out. */
const stateOf = (sql: SqlClient.SqlClient, row: SessionRow) =>
  Effect.map(consentOf(sql, row.workspaceId), (consent): StaffRefusal | undefined =>
    row.endedAt !== null
      ? "session_ended"
      : row.expiresAt.getTime() <= Date.now()
      ? "session_expired"
      : consent === "workspace_not_found"
      ? "workspace_not_found"
      : consent)

/**
 * Before a read (`rpc`, as the staff page names it `said`): the session must be the caller's, live, and the consent
 * still on. Written to both trails before the read runs; the caller then reads as `viewerPrincipal`.
 */
export const beginRead = Effect.fn("Staff.beginRead")(
  function*(staff: string, sessionId: string, rpc: string, said: string) {
    const row = yield* own(staff, sessionId)
    if (row === undefined) return yield* refuse(staff, { action: "session.read", sessionId, rpc }, "no_session")
    const line = { action: "session.read", workspaceId: row.workspaceId, sessionId, rpc } as const
    const db = yield* Db
    const refused = yield* db.asStaff(staff, row.workspaceId)((sql) => stateOf(sql, row))
    if (refused !== undefined) return yield* refuse(staff, line, refused)
    yield* db.recordAsStaff(staff, row.workspaceId)((sql) =>
      Effect.gen(function*() {
        yield* auditLine(sql, staff, { ...line, outcome: "ok" })
        yield* logbook(sql, row.workspaceId, sessionId, "support.read", `Bekeken: ${said}`)
      })
    )
    return sessionOf(row)
  }
)

/** A refusal from a step the transport took itself (an RPC not on the list), in the team's audit. */
export const refuseRead = (staff: string, sessionId: string, rpc: string, code: StaffRefusal) =>
  Effect.flatMap(
    own(staff, sessionId),
    (row) => refuse(staff, { action: "session.read", workspaceId: row?.workspaceId ?? null, sessionId, rpc }, code)
  )

/** A read that ran and failed, by its error's tag: the team sees why, the Logboek already has the read. */
export const failedRead = Effect.fn("Staff.failedRead")(
  function*(staff: string, read: StaffSession, rpc: string, code: string) {
    const db = yield* Db
    yield* db.recordAsStaff(staff, null)((sql) =>
      auditLine(sql, staff, {
        action: "session.read",
        workspaceId: read.workspaceId,
        sessionId: read.id,
        rpc,
        outcome: "failed",
        code
      })
    )
  }
)

/** Ends one's own session; ending one already over says so and changes nothing. */
export const end = Effect.fn("Staff.end")(function*(staff: string, sessionId: string) {
  const row = yield* own(staff, sessionId)
  if (row === undefined) return yield* refuse(staff, { action: "session.end", sessionId }, "no_session")
  if (row.endedAt !== null) return sessionOf(row)
  const db = yield* Db
  const ended = yield* db.recordAsStaff(staff, row.workspaceId)((sql) =>
    Effect.gen(function*() {
      const [done] = yield* sql<SessionRow>`
        update staff_sessions set ended_at = now() where id = ${sessionId} and ended_at is null
        returning id, workspace_id, reason, started_at, expires_at, ended_at`
      yield* auditLine(sql, staff, {
        action: "session.end",
        workspaceId: row.workspaceId,
        sessionId,
        outcome: "ok"
      })
      yield* logbook(sql, row.workspaceId, sessionId, "support.session_ended", "Meekijken beëindigd")
      return done ?? row
    })
  )
  return sessionOf(ended)
})

/** One line of the team's own audit, as the staff page lists it. */
export interface StaffAuditEntry {
  readonly at: string
  readonly staff: string
  readonly action: string
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly rpc: string | null
  readonly outcome: string
  readonly code: string | null
}

/** The team's audit, newest first: of one workspace, or of everyone's latest. Itself not audited (it is the audit). */
export const trail = Effect.fn("Staff.trail")(function*(staff: string, workspaceId: string | null) {
  const db = yield* Db
  const rows = yield* db.asStaff(staff, null)((sql) =>
    sql<
      {
        at: Date
        staffEmail: string
        action: string
        workspaceId: string | null
        sessionId: string | null
        rpc: string | null
        outcome: string
        code: string | null
      }
    >`
      select at, staff_email, action, workspace_id, session_id, rpc, outcome, code from staff_audit
      where ${workspaceId === null ? sql`true` : sql`workspace_id = ${workspaceId}`}
      order by at desc, id desc limit 200`
  )
  return rows.map((r): StaffAuditEntry => ({
    at: r.at.toISOString(),
    staff: r.staffEmail,
    action: r.action,
    workspaceId: r.workspaceId,
    sessionId: r.sessionId,
    rpc: r.rpc,
    outcome: r.outcome,
    code: r.code
  }))
})

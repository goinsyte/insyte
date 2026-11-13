import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { ConnectionGate } from "../../stores/domain/Ports.ts"
import { DELETION_DAYS, type RequestDeletion, type RequestMade } from "../domain/Privacy.ts"
import { ProviderGrants } from "../Grants.ts"
import { requireOwner } from "./reads.ts"

/*
 * Deleting the workspace (M17 step 5; security.md §6 "Workspace deletion"): the owner's alone, with the workspace's
 * name typed as confirmation. It does not happen at once: the request waits 7 days, during which the workspace works
 * as before and the owner can stop it ("Verwijderen stoppen"); the waiting request is the only mark. Then
 * `WorkspaceLifecycleWorkflow` purges it: the request is taken (`purging`, after which it can no longer be stopped),
 * the providers' grants given back (the Shopify app uninstalled, Klaviyo's and Slack's tokens revoked), the tokens
 * dropped and forgotten by the gate, the files removed from the bucket, and every row the workspace holds deleted
 * (`purge_workspace`, 0076). A purge that stalls is started again by the daily sweep. There is no undo after the
 * wait; asking is confirm-only (api.md §1.1). Billing has no Stripe subscription yet (M13), so there is nothing to
 * cancel there.
 */

export const requestDeletion = Effect.fn("Workspaces.requestDeletion")(function*(input: RequestDeletion) {
  const principal = yield* requireOwner()
  const db = yield* Db
  const { id, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [workspace] = yield* sql<{ name: string }>`
        select name from workspaces where id = ${principal.workspaceId} for update`
      if (workspace === undefined || workspace.name.trim() !== input.confirmName.trim()) {
        return yield* new Invalid({ fields: { confirmName: "mismatch" } })
      }
      const [waiting] = yield* sql<{ id: string }>`
        select id from gdpr_requests where kind = 'workspace_delete' and state in ('waiting', 'purging')`
      if (waiting !== undefined) return yield* new Conflict({ entity: "workspace", reason: "deletion_waiting" })
      const id = mintId("gdpr")
      yield* sql.unsafe(
        `insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, requested_by, state, attempts,
                                    started_at)
         values ($1, $2, 'workspace_delete', 'operator', '{}'::jsonb, now() + interval '${DELETION_DAYS} days', $3,
                 'waiting', 1, now())`,
        [id, principal.workspaceId, principal.id]
      )
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.deletion_requested",
        subjectType: "gdpr_request",
        subjectId: id,
        diff: { days: DELETION_DAYS }
      })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "privacy.deletion_requested",
        workspaceId: principal.workspaceId,
        userId: principal.id,
        requestId: id,
        attempt: 1
      })
      return { id, outboxId }
    })
  )
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
  return { id } satisfies RequestMade
})

/**
 * "Verwijderen stoppen", during the wait: the workspace stays, and its run finds nothing to do when it wakes. Once
 * the purge has taken the request, it can no longer be stopped.
 */
export const cancelDeletion = Effect.fn("Workspaces.cancelDeletion")(function*() {
  const principal = yield* requireOwner()
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ id: string }>`
        update gdpr_requests set state = 'cancelled', completed_at = now()
        where kind = 'workspace_delete' and state = 'waiting' and due_at > now()
        returning id`
      if (row === undefined) {
        const [purging] = yield* sql<{ id: string }>`
          select id from gdpr_requests where kind = 'workspace_delete' and state = 'purging'`
        return yield* new Conflict({ entity: "workspace", reason: purging === undefined ? "no_deletion" : "purging" })
      }
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "workspace.deletion_cancelled",
        subjectType: "gdpr_request",
        subjectId: row.id
      })
      return { id: row.id } satisfies RequestMade
    })
  )
})

/* ── the run's steps ──────────────────────────────────────────────────────────────────────────── */

/** When the deletion is due, while it still waits or is being purged; null once it was stopped (or is gone). */
export const deletionDue = Effect.fn("Privacy.deletion.due")(function*(requestId: string, attempt: number) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ dueAt: Date }>`select due_at from gdpr_requests
                         where id = ${requestId} and kind = 'workspace_delete' and attempts = ${attempt}
                           and state in ('waiting', 'purging')`
  )
  return row === undefined ? null : row.dueAt.getTime()
})

/**
 * The wait is over: the request taken for the purge (`purging`), so it can no longer be stopped, then the providers'
 * grants given back while Insyte still holds the tokens. Answers what each provider gave back; null when the purge
 * does not go ahead (stopped in time, or no longer this attempt's).
 */
export const revokeConnections = Effect.fn("Privacy.deletion.revoke")(function*(requestId: string, attempt: number) {
  const db = yield* Db
  const grants = yield* ProviderGrants
  const [taken] = yield* db.scopedFor((sql) =>
    sql<{ id: string }>`
      update gdpr_requests set state = 'purging'
      where id = ${requestId} and kind = 'workspace_delete' and attempts = ${attempt}
        and state in ('waiting', 'purging') and due_at <= now()
      returning id`
  )
  if (taken === undefined) return null
  const released = yield* grants.release
  yield* Effect.logInfo("workspace deletion: grants given back", { requestId, released })
  return released
})

/**
 * The purge, once the request is taken: tokens dropped and forgotten, files removed, rows deleted. Answers whether it
 * purged. Run again after a failure, it finds less each time, and nothing once done.
 */
export const purgeWorkspace = Effect.fn("Privacy.deletion.purge")(function*(requestId: string, attempt: number) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  const gate = yield* ConnectionGate
  const found = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [due] = yield* sql<{ id: string }>`
        select id from gdpr_requests where id = ${requestId} and kind = 'workspace_delete' and state = 'purging'
          and attempts = ${attempt} and due_at <= now()`
      if (due === undefined) return null
      const connections = yield* sql<{ id: string }>`select id from connections`
      // Insyte can no longer act for the workspace anywhere, before anything else goes.
      yield* sql`delete from connection_credentials`
      const keys = yield* sql<{ key: string }>`
        select r2_key as key from files
        union all select body_html_key from email_messages where body_html_key is not null
        union all select body_r2_key from inbound_events where body_r2_key is not null`
      return { connections: connections.map((c) => c.id), keys: keys.map((k) => k.key) }
    })
  )
  if (found === null) return false
  yield* Effect.forEach(found.connections, (id) => gate.forget(id), { discard: true })
  for (let i = 0; i < found.keys.length; i += 1000) yield* files.remove(found.keys.slice(i, i + 1000))
  // Whatever else the workspace kept in the bucket (an export's carried bytes, a key no row names): its prefix.
  yield* files.removePrefix(`${ws.id}/`)
  yield* db.scopedFor((sql) => sql`select purge_workspace(${ws.id})`)
  yield* Effect.logInfo("workspace purged", { workspaceId: ws.id, requestId })
  return true
})

/* ── the daily sweep ──────────────────────────────────────────────────────────────────────────── */

/** Deletions an hour past their time and still not done, across workspaces: their run never woke, or gave up. */
export const deletionsStranded = Effect.flatMap(
  Effect.service(Db),
  (db) =>
    db.routing((sql) =>
      sql<{ workspaceId: WorkspaceId; requestId: string }>`
      select workspace_id, request_id from privacy_deletions_stranded()`
    )
)

/** A stranded deletion started again, as a new attempt with a run of its own. As `system` in its workspace. */
export const restartDeletion = Effect.fn("Privacy.deletion.restart")(function*(requestId: string) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const outboxId = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ attempts: number; requestedBy: string | null }>`
        update gdpr_requests set attempts = attempts + 1, started_at = now()
        where id = ${requestId} and kind = 'workspace_delete' and state in ('waiting', 'purging')
        returning attempts, requested_by`
      if (row === undefined) return null
      return yield* Outbox.write(sql, ws.id, {
        type: "privacy.deletion_requested",
        workspaceId: ws.id,
        userId: row.requestedBy ?? "system",
        requestId,
        attempt: row.attempts
      })
    })
  )
  if (outboxId !== null) yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
})

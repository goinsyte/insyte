import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { ConnectionGate } from "../../stores/domain/Ports.ts"
import { DELETION_DAYS, type RequestDeletion, type RequestMade } from "../domain/Privacy.ts"
import { requireOwner } from "./reads.ts"

/*
 * Deleting the workspace (M17 step 5; security.md §6 "Workspace deletion"): the owner's alone, with the workspace's
 * name typed as confirmation. It does not happen at once: the request waits 7 days, during which the workspace works
 * as before and the owner can stop it ("Verwijderen stoppen"). Then `WorkspaceLifecycleWorkflow` purges it: the
 * stores' and services' tokens dropped and forgotten by the gate, the files removed from the bucket, and every row
 * the workspace holds deleted (`purge_workspace`, 0076). There is no undo after the wait; asking is confirm-only
 * (api.md §1.1). Billing has no Stripe subscription yet (M13), so there is nothing to cancel there.
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
        select id from gdpr_requests where kind = 'workspace_delete' and state = 'waiting'`
      if (waiting !== undefined) return yield* new Conflict({ entity: "workspace", reason: "deletion_waiting" })
      const id = mintId("gdpr")
      yield* sql.unsafe(
        `insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, requested_by, state)
         values ($1, $2, 'workspace_delete', 'operator', '{}'::jsonb, now() + interval '${DELETION_DAYS} days', $3,
                 'waiting')`,
        [id, principal.workspaceId, principal.id]
      )
      yield* sql`update workspaces set deleted_at = now() where id = ${principal.workspaceId}`
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
        requestId: id
      })
      return { id, outboxId }
    })
  )
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
  return { id } satisfies RequestMade
})

/** "Verwijderen stoppen", during the wait: the workspace stays, and its run finds nothing to do when it wakes. */
export const cancelDeletion = Effect.fn("Workspaces.cancelDeletion")(function*() {
  const principal = yield* requireOwner()
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ id: string }>`
        update gdpr_requests set state = 'cancelled', completed_at = now()
        where kind = 'workspace_delete' and state = 'waiting' and due_at > now()
        returning id`
      if (row === undefined) return yield* new Conflict({ entity: "workspace", reason: "no_deletion" })
      yield* sql`update workspaces set deleted_at = null where id = ${principal.workspaceId}`
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

/** When the deletion is due, while it still waits; null once it was stopped (or is gone). */
export const deletionDue = Effect.fn("Privacy.deletion.due")(function*(requestId: string) {
  const db = yield* Db
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ dueAt: Date }>`select due_at from gdpr_requests
                         where id = ${requestId} and kind = 'workspace_delete' and state = 'waiting'`
  )
  return row === undefined ? null : row.dueAt.getTime()
})

/**
 * The purge, once the wait is over and the request still waits: tokens dropped and forgotten, files removed, rows
 * deleted. Answers whether it purged. Run again after a failure, it finds less each time, and nothing once done.
 */
export const purgeWorkspace = Effect.fn("Privacy.deletion.purge")(function*(requestId: string) {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const files = yield* FileStore
  const gate = yield* ConnectionGate
  const found = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [due] = yield* sql<{ id: string }>`
        select id from gdpr_requests where id = ${requestId} and kind = 'workspace_delete' and state = 'waiting'
          and due_at <= now()`
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
  yield* db.scopedFor((sql) => sql`select purge_workspace(${ws.id})`)
  yield* Effect.logInfo("workspace purged", { workspaceId: ws.id, requestId })
  return true
})

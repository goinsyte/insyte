import { mintId } from "@insyte/domain/Ids"
import type { PrincipalKind } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../domain/Outbox.ts"
import * as Outbox from "./Outbox.ts"

/*
 * Who changed what (M1.3): one row per change, on the use case's transaction, so the change and its record commit
 * together. Append-only for the app (`audit_events` refuses update and delete to `insyte_app`). Each entry also writes
 * a `records.changed` event for the realtime sink, on the same transaction.
 */

export interface Actor {
  readonly kind: PrincipalKind
  readonly id: string
  readonly onBehalfOf?: string | undefined
}

export interface AuditEntry {
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly section?: string | undefined
  /** What changed, before → after, for the fields that did. Ids and values, never secrets. */
  readonly diff?: Record<string, unknown> | undefined
}

export const write = Effect.fn("Audit.write")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, actor: Actor, entry: AuditEntry) {
    yield* sql`insert into audit_events
               (id, workspace_id, actor_kind, actor_id, on_behalf_of, action, subject_type, subject_id, section, diff)
               values (${mintId("aud")}, ${workspaceId}, ${actor.kind}, ${actor.id}, ${actor.onBehalfOf ?? null},
                       ${entry.action}, ${entry.subjectType}, ${entry.subjectId}, ${entry.section ?? null},
                       ${JSON.stringify(entry.diff ?? {})}::jsonb)`
    // Every recorded change is also a realtime one: the workspace's open tabs refetch that kind (M5.1).
    const outboxId = yield* Outbox.write(sql, workspaceId, {
      type: "records.changed",
      workspaceId,
      kind: entry.subjectType,
      ids: [entry.subjectId]
    })
    ;(yield* PendingEvents)?.add(outboxId)
  }
)

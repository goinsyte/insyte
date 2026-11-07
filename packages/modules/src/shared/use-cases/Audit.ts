import { mintId } from "@insyte/domain/Ids"
import type { PrincipalKind } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * Who changed what (M1.3): one row per change, on the use case's transaction, so the change and its record commit
 * together. Append-only for the app (`audit_events` refuses update and delete to `insyte_app`).
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
  }
)

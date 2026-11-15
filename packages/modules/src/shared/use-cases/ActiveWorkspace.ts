import type { UserId, WorkspaceId } from "@insyte/domain/Ids"
import type { SqlClient } from "effect/sql"

/*
 * The workspace a session acts in (M3.1), on the caller's transaction: `Session.switchPrincipal` and the switcher
 * write it, and so does making a new workspace, which the person goes on in at once. Only the session's own row, and
 * only the person's: a session id from someone else's request changes nothing. `Sessions.userFrom` reads it back on
 * every request, past better-auth's cookie cache.
 */

export type ActiveKind = "member" | "supplier_contact"

export const activate = (
  sql: SqlClient.SqlClient,
  session: { readonly id: string; readonly userId: UserId },
  workspaceId: WorkspaceId | null,
  kind: ActiveKind = "member"
) =>
  sql`update auth.session set active_workspace_id = ${workspaceId}, active_principal_kind = ${
    workspaceId === null ? null : kind
  }
      where id = ${session.id} and user_id = ${session.userId}`

/** The session no longer acts in `workspaceId` (the person left it): back to the newest membership. */
export const release = (
  sql: SqlClient.SqlClient,
  session: { readonly id: string; readonly userId: UserId },
  workspaceId: WorkspaceId
) =>
  sql`update auth.session set active_workspace_id = null, active_principal_kind = null
      where id = ${session.id} and user_id = ${session.userId} and active_workspace_id = ${workspaceId}`

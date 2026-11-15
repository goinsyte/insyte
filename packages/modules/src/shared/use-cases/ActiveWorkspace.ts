import type { UserId, WorkspaceId } from "@insyte/domain/Ids"
import type { SqlClient } from "effect/sql"

/*
 * The workspace a session acts in (M3.1), on the caller's transaction: the switcher writes it, and so does making a new
 * workspace, which the person goes on in at once, and so does the session's first request inside a workspace
 * (`Workspaces.current`), so that joining or making another one later does not move it. Only the session's own row, and
 * only the person's: a session id from someone else's request changes nothing. `Sessions.userFrom` reads it back on
 * every request, past better-auth's cookie cache. Always as a member: the supplier portal picks its own contact.
 */

export const activate = (
  sql: SqlClient.SqlClient,
  session: { readonly id: string; readonly userId: UserId },
  workspaceId: WorkspaceId | null
) =>
  sql`update auth.session set active_workspace_id = ${workspaceId},
                              active_principal_kind = ${workspaceId === null ? null : "member"}
      where id = ${session.id} and user_id = ${session.userId}`

/** The session no longer acts in `workspaceId` (the person left it): back to the newest membership. */
export const release = (
  sql: SqlClient.SqlClient,
  session: { readonly id: string; readonly userId: UserId },
  workspaceId: WorkspaceId
) =>
  sql`update auth.session set active_workspace_id = null, active_principal_kind = null
      where id = ${session.id} and user_id = ${session.userId} and active_workspace_id = ${workspaceId}`

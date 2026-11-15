import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"

/*
 * What ends with a member's access to a workspace (M3.1), on the caller's transaction inside it. Their calls are
 * refused from the next request on (the principal is read per call); `member.access_ended` closes their open sockets
 * in the workspace's room. The keys they made stop at once while they are out (`ApiKeys.authenticate` turns a removed
 * maker's keys away), and are revoked outright when they leave or come back through a new invitation, so a return
 * never brings old keys back to life.
 */

/** Their sockets in the workspace's room, closed once the transaction commits. */
export const closeSockets = Effect.fn("Members.closeSockets")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, memberId: string) {
    const id = yield* Outbox.write(sql, workspaceId, { type: "member.access_ended", workspaceId, memberId })
    ;(yield* PendingEvents)?.add(id)
  }
)

/** The API and MCP keys the member made in this workspace, revoked as of now (by the member themselves). */
export const revokeKeysOf = (sql: SqlClient.SqlClient, memberId: string) =>
  sql`update api_keys set revoked_at = now(), revoked_by = ${memberId}
      where created_by = ${memberId} and revoked_at is null`

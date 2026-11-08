import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OutboxEvent } from "../domain/Outbox.ts"

/**
 * Writes one outbox event on the use case's transaction, in its workspace; answers the id for the relay's kick.
 * `afterSeconds` holds it back that long (`not_before`): an effect outside Insyte waits out the undo window, so undo can
 * still cancel it.
 */
export const write = Effect.fn("Outbox.write")(
  function*(
    sql: SqlClient.SqlClient,
    workspaceId: string,
    event: OutboxEvent,
    options: { readonly afterSeconds?: number } = {}
  ) {
    const { type, ...payload } = event
    const id = mintId("obx")
    const after = options.afterSeconds ?? 0
    yield* sql`insert into outbox (id, workspace_id, event, payload, not_before)
             values (${id}, ${workspaceId}, ${type}, ${JSON.stringify(payload)}::jsonb,
                     case when ${after} > 0 then now() + make_interval(secs => ${after}) end)`
    return id
  }
)

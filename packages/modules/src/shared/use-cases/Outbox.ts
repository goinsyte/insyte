import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OutboxEvent } from "../domain/Outbox.ts"

/** Writes one outbox event on the use case's transaction, in its workspace; answers the id for the relay's kick. */
export const write = Effect.fn("Outbox.write")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, event: OutboxEvent) {
    const { type, ...payload } = event
    const id = mintId("obx")
    yield* sql`insert into outbox (id, workspace_id, event, payload)
             values (${id}, ${workspaceId}, ${type}, ${JSON.stringify(payload)}::jsonb)`
    return id
  }
)

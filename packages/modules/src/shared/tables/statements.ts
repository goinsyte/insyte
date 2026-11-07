import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * A migration written as plain SQL statements, run one after another in the migration's transaction. One statement per
 * string: the driver sends each as its own query.
 */
export const statements = (...sql: ReadonlyArray<string | ReadonlyArray<string>>) =>
  Effect.gen(function*() {
    const client = yield* SqlClient.SqlClient
    for (const statement of sql.flat()) yield* client.unsafe(statement)
  })

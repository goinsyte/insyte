import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"

/*
 * The website chat's widget lookups (M15 step 8, `inbox/use-cases/chat/widget.ts`): every widget request finds its
 * session's conversation by store and visitor, closed ones too (whether the shopper ended the session), newest first.
 * The index that serves them leads with the workspace, which the row policy adds to every query, then the store and
 * the visitor, and holds closed conversations as well, so the partial index of open ones is not all there is. Read from
 * the catalogue: which index the planner takes on a table of a test's size is noise (the PR has its plan at 200,000).
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"

const indexesOf = (table: string) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return yield* sql<{ name: string; definition: string }>`
        select indexname as name, indexdef as definition from pg_indexes where tablename = ${table}`
    }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(APP_URL) }).pipe(Layer.orDie)))
  )

describe("the website chat's widget lookups", () => {
  it("have an index by workspace, store and visitor, newest first, over closed conversations too", async () => {
    const session = (await indexesOf("channel_threads")).find((i) => i.name === "channel_threads_session")
    expect(session?.definition).toContain("(workspace_id, store_id, visitor_hash, created_at DESC)")
    expect(session?.definition).not.toContain("WHERE")
  })
})

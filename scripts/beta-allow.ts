/*
 * Lets an address, or a whole domain, create an account while Insyte is invite-only (M2.2): a row in `beta_allowlist`,
 * written as `insyte_owner` because the app may only read it. Staff run it; an internal page replaces it later.
 *
 *   bun run beta:allow --local naam@winkel.nl "note"
 *   bun run beta:allow --env staging @winkel.nl     DATABASE_URL_OWNER from the environment
 *
 * Production is CI-only, as migrating it is (`backend · migrate production`).
 */
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { LOCAL_OWNER_URL } from "./lib/local-db.ts"

const args = process.argv.slice(2)
const local = args.includes("--local")
const envAt = args.indexOf("--env")
const environment = local ? "local" : envAt === -1 ? undefined : args[envAt + 1]
const rest = args.filter((a, i) => a !== "--local" && a !== "--env" && i !== envAt + 1)
const entry = rest[0]?.trim().toLowerCase()
const note = rest[1]

if (environment === undefined || entry === undefined || !/^(@|[^@\s]+@)[^@\s]+\.[^@\s]+$/.test(entry)) {
  console.error("Usage: bun run beta:allow (--local | --env <preview|staging|production>) <address | @domain> [note]")
  process.exit(1)
}
if (environment === "production" && process.env["CI"] !== "true") {
  console.error("Production's allowlist is written by CI only, never from a laptop.")
  process.exit(1)
}
const url = local ? LOCAL_OWNER_URL : process.env["DATABASE_URL_OWNER"]
if (url === undefined || url === "") {
  console.error("Set DATABASE_URL_OWNER for that environment.")
  process.exit(1)
}

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`insert into beta_allowlist (entry, note) values (${entry}, ${note ?? null})
    on conflict (entry) do update set note = coalesce(excluded.note, beta_allowlist.note)`
  console.log(`beta:allow: ${entry} may create an account on ${environment} (${new URL(url).host})`)
})

await Effect.runPromise(program.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) }))))

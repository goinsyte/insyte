/*
 * Keeps `preview-base` (infra/previews.ts) what every preview forks (M1.5, 03 §2.2): staging's schema, the three
 * scenario workspaces, and nobody's data. The branch is a fork of nonprod `main`; on its first run (no scenario
 * workspace yet) every row but the migration ledger is removed and the seed written. After that it is never copied from
 * `main` again, so staging's rows cannot return.
 *
 *   bun scripts/preview-base.ts --first   a PR's run: only that first emptying and seed, never a migration, so a PR's own
 *                                         migrations cannot reach the other PRs
 *   bun scripts/preview-base.ts           staging's run, after migrating `main`: the same first run if needed, then
 *                                         staging's migrations and the seed again
 *
 * Needs NEON_API_KEY (the project is nonprod, `infra/stages.ts`), and `insyte_owner`'s password as INSYTE_OWNER_DB_PASSWORD or inside
 * DATABASE_URL_OWNER: a fork keeps its parent's roles and passwords.
 */
import { PgClient } from "@effect/sql-pg"
import { migrate, MIGRATIONS_TABLE } from "@insyte/database/Migrator"
import { Migrations } from "@insyte/modules/shared/tables/Migrations"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { branchHost } from "./lib/neon.ts"
import { ownerUrlFor } from "./lib/owner-url.ts"
import { seed, seeded } from "./lib/seed.ts"

const firstOnly = process.argv.includes("--first")
const fromUrl = process.env["DATABASE_URL_OWNER"]
const password = process.env["INSYTE_OWNER_DB_PASSWORD"] ??
  (fromUrl === undefined || fromUrl === "" ? undefined : decodeURIComponent(new URL(fromUrl).password))
if (password === undefined) {
  console.error("preview-base: needs INSYTE_OWNER_DB_PASSWORD or DATABASE_URL_OWNER")
  process.exit(1)
}
const host = await branchHost("preview-base")
console.log(`preview-base on ${host}`)

/** Every table the app writes, in the schemas the migrations create, but the ledger. */
const empty = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const tables = yield* sql<{ name: string }>`
    select format('%I.%I', schemaname, tablename) as name from pg_tables
    where schemaname in ('public', 'auth') and not (schemaname = 'public' and tablename = ${MIGRATIONS_TABLE})`
  if (tables.length > 0) yield* sql.unsafe(`truncate ${tables.map((t) => t.name).join(", ")} cascade`)
  console.log(`  emptied ${tables.length} tables of the rows forked from main`)
})

const program = Effect.gen(function*() {
  if ((yield* seeded).length === 0) {
    yield* empty
    for (const w of yield* seed) console.log(`  seeded ${w.scenario}: ${w.workspaceId} (first run)`)
  }
  if (firstOnly) return
  const applied = yield* migrate(Migrations)
  for (const [id, name] of applied) console.log(`  applied ${String(id).padStart(4, "0")}_${name}`)
  for (const w of yield* seed) console.log(`  seeded ${w.scenario}: ${w.workspaceId}`)
})

await Effect.runPromise(
  program.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(ownerUrlFor(host, password)) })))
)

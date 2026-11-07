/*
 * Applies the migrations (M1.1). As `insyte_owner`, never as the app's role.
 *
 *   bun run db:migrate --local                      the compose database
 *   bun run db:migrate --env staging                DATABASE_URL_OWNER from the environment (CI, per GitHub environment)
 *   bun run db:migrate --env preview --host <host>  a preview's Neon branch, as insyte_owner with INSYTE_OWNER_DB_PASSWORD
 *
 * Prints the host it is about to change, refuses production outside CI, and afterwards checks that every key in the
 * manifest is recorded.
 */
import { PgClient } from "@effect/sql-pg"
import { migrate, MIGRATIONS_TABLE } from "@insyte/database/Migrator"
import { Migrations } from "@insyte/modules/shared/tables/Migrations"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { LOCAL_OWNER_URL } from "./lib/local-db.ts"

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const local = process.argv.includes("--local")
const environment = local ? "local" : arg("--env")
if (environment === undefined) {
  console.error("Say where: --local, or --env <preview|staging|production>.")
  process.exit(1)
}
if (environment === "production" && process.env["CI"] !== "true") {
  console.error("Production is migrated by CI only (backend · migrate production), never from a laptop.")
  process.exit(1)
}
const host = arg("--host")
const ownerPassword = process.env["INSYTE_OWNER_DB_PASSWORD"]
const url = local
  ? LOCAL_OWNER_URL
  : host !== undefined && ownerPassword !== undefined
  ? `postgresql://insyte_owner:${encodeURIComponent(ownerPassword)}@${host}/insyte?sslmode=require`
  : process.env["DATABASE_URL_OWNER"]
if (url === undefined || url === "") {
  console.error("Set DATABASE_URL_OWNER, or pass --host with INSYTE_OWNER_DB_PASSWORD set.")
  process.exit(1)
}
console.log(`Migrating ${environment} on ${new URL(url).host}`)

const program = Effect.gen(function*() {
  const applied = yield* migrate(Migrations)
  for (const [id, name] of applied) console.log(`  applied ${String(id).padStart(4, "0")}_${name}`)
  if (applied.length === 0) console.log("  nothing to apply")

  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ migrationId: number; name: string }>`
    select migration_id, name from ${sql(MIGRATIONS_TABLE)} order by migration_id`
  const recorded = new Set(rows.map((r) => `${String(r.migrationId).padStart(4, "0")}_${r.name}`))
  const missing = Object.keys(Migrations).filter((key) => !recorded.has(key))
  if (missing.length > 0) return yield* Effect.die(new Error(`Not recorded after migrating: ${missing.join(", ")}`))
})

await Effect.runPromise(program.pipe(
  Effect.provide(PgClient.layer({
    url: Redacted.make(url),
    transformResultNames: (s) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  }))
))

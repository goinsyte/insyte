/*
 * Keeps `preview-base` (infra/previews.ts) what every preview branches from (M1.5, 03 §2.2): staging's schema, the
 * three scenario workspaces, and nobody's data. The branch is a schema-only copy of nonprod `main`, so it arrives with
 * the migrations table but none of its rows; it is given `main`'s, which name exactly the migrations its schema came
 * from.
 *
 *   bun scripts/preview-base.ts --adopt   a PR's run: the ledger, and the seed only if the branch never had one; never
 *                                         a migration, so a PR's own migrations cannot reach the other PRs
 *   bun scripts/preview-base.ts           staging's run, after migrating `main`: the ledger, the migrations, the seed
 *
 * Needs NEON_API_KEY and NEON_PROJECT_ID (nonprod), and `insyte_owner`'s password as INSYTE_OWNER_DB_PASSWORD or inside
 * DATABASE_URL_OWNER: a branch made from `main` keeps its roles' passwords.
 */
import { PgClient } from "@effect/sql-pg"
import { migrate, MIGRATIONS_TABLE } from "@insyte/database/Migrator"
import { Migrations } from "@insyte/modules/shared/tables/Migrations"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { branchHost } from "./lib/neon.ts"
import { ownerUrlFor } from "./lib/owner-url.ts"
import { seed, seeded } from "./lib/seed.ts"

const adoptOnly = process.argv.includes("--adopt")
const fromUrl = process.env["DATABASE_URL_OWNER"]
const password = process.env["INSYTE_OWNER_DB_PASSWORD"] ??
  (fromUrl === undefined || fromUrl === "" ? undefined : decodeURIComponent(new URL(fromUrl).password))
if (password === undefined) {
  console.error("preview-base: needs INSYTE_OWNER_DB_PASSWORD or DATABASE_URL_OWNER")
  process.exit(1)
}
const client = (host: string) => PgClient.layer({ url: Redacted.make(ownerUrlFor(host, password)) })

const [mainHost, baseHost] = await Promise.all([branchHost("main"), branchHost("preview-base")])
console.log(`preview-base on ${baseHost}`)

interface Entry {
  readonly migration_id: number
  readonly name: string
  readonly created_at: Date
}
const ledger = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql<Entry>`select migration_id, name, created_at from ${sql(MIGRATIONS_TABLE)} order by migration_id`
)

const recorded = await Effect.runPromise(ledger.pipe(Effect.provide(client(baseHost))))
if (recorded.length === 0) {
  const fromMain = await Effect.runPromise(ledger.pipe(Effect.provide(client(mainHost))))
  await Effect.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        Effect.forEach(fromMain, (e) =>
          sql`insert into ${sql(MIGRATIONS_TABLE)} (migration_id, name, created_at)
            values (${e.migration_id}, ${e.name}, ${e.created_at})`)
    ).pipe(Effect.provide(client(baseHost)))
  )
  console.log(`  adopted main's ledger: ${fromMain.length} migrations`)
}
if (adoptOnly) {
  const bootstrap = Effect.gen(function*() {
    if ((yield* seeded).length > 0) return
    for (const w of yield* seed) console.log(`  seeded ${w.scenario}: ${w.workspaceId} (first seed)`)
  })
  await Effect.runPromise(bootstrap.pipe(Effect.provide(client(baseHost))))
} else {
  const program = Effect.gen(function*() {
    const applied = yield* migrate(Migrations)
    for (const [id, name] of applied) console.log(`  applied ${String(id).padStart(4, "0")}_${name}`)
    for (const w of yield* seed) console.log(`  seeded ${w.scenario}: ${w.workspaceId}`)
  })
  await Effect.runPromise(program.pipe(Effect.provide(client(baseHost))))
}

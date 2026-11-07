/*
 * Writes the design reference's three scenario workspaces (M1.5; `scripts/lib/seed.ts`). As `insyte_owner`, and never
 * where people's data lives: the compose database, or a preview's Neon branch (`preview-base`, refreshed by CI).
 *
 *   bun run db:seed --local
 *   bun run db:seed --env preview --host <host>    with INSYTE_OWNER_DB_PASSWORD set
 *   … --check                                       writes nothing; fails unless all three are there (a preview's CI)
 */
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { ownerUrl } from "./lib/owner-url.ts"
import { SCENARIOS, seed, seeded } from "./lib/seed.ts"

const { environment, url } = ownerUrl()
if (environment !== "local" && environment !== "preview") {
  console.error("The seed writes the compose database (--local) or a preview's branch (--env preview), nothing else.")
  process.exit(1)
}
if (url === undefined || url === "") {
  console.error("Pass --host with INSYTE_OWNER_DB_PASSWORD set.")
  process.exit(1)
}
const database = PgClient.layer({ url: Redacted.make(url) })

if (process.argv.includes("--check")) {
  const present = await Effect.runPromise(seeded.pipe(Effect.provide(database)))
  console.log(`Seeded on ${new URL(url).host}: ${present.length} of ${SCENARIOS.length} (${present.join(", ")})`)
  if (present.length !== SCENARIOS.length) process.exit(1)
} else {
  console.log(`Seeding ${environment} on ${new URL(url).host}`)
  const written = await Effect.runPromise(seed.pipe(Effect.provide(database)))
  for (const w of written) console.log(`  ${w.scenario}: ${w.workspaceId}, ${w.members} members`)
}

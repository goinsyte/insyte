/*
 * The migration rules (08 §2; the rules themselves are in `lib/migrations-rules.ts`), against the branch this one
 * merges into.
 *
 *   bun run migrations:check                   against origin/staging
 *   bun run migrations:check --base <ref>      against another ref
 *
 * A migration's key is its file name, and the manifest lists them in order: `migrations/0002_platform.ts` is
 * `"0002_platform"`. Run in hygiene, so in preflight and CI.
 */
import { TENANT_TABLES } from "@insyte/database/Tenancy"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { checkMigrations, type MigrationFile } from "./lib/migrations-rules.ts"

const DIR = "packages/modules/src/shared/tables"
const MANIFEST = `${DIR}/Migrations.ts`

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const baseRef = arg("--base") ?? "origin/staging"

const git = (...args: Array<string>) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

/** The manifest's imports, in key order: `import platform from "./migrations/0002_platform.ts"` → that file. */
const filesOf = (manifest: string, read: (path: string) => string): Array<MigrationFile> => {
  const keys = [...manifest.matchAll(/^\s*"(\d{4}_[a-z0-9_]+)":/gm)].map((m) => m[1]!)
  return keys.map((key) => {
    const relative = manifest.match(new RegExp(`from "\\./(migrations/(?:contract/)?${key}\\.ts)"`))?.[1]
    if (relative === undefined) throw new Error(`${key}: no migrations/${key}.ts imported in ${MANIFEST}`)
    const path = `${DIR}/${relative}`
    return { key, path, source: read(path) }
  })
}

try {
  git("rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`)
} catch {
  // Without the base every migration looks new, and the check would pass anything: refuse instead.
  console.error(`migrations:check: ${baseRef} is not here. Fetch it: git fetch origin staging`)
  process.exit(1)
}

let base: Array<MigrationFile> = []
try {
  base = filesOf(git("show", `${baseRef}:${MANIFEST}`), (path) => git("show", `${baseRef}:${path}`))
} catch {
  // The base has no manifest yet: everything is new.
}
const head = filesOf(readFileSync(MANIFEST, "utf8"), (path) => readFileSync(path, "utf8"))

const errors = checkMigrations(base, head, TENANT_TABLES)
if (errors.length > 0) {
  console.error(`\nmigrations:check against ${baseRef} failed:`)
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`migrations:check: ${head.length} migrations, ${head.length - base.length} new since ${baseRef}`)

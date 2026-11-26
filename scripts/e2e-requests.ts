/*
 * The console journeys' API calls against `lib/e2e-requests-rules.ts`: every one through a context `access.ts` sealed,
 * so a failed call cannot print its headers into CI's public log.
 *
 *   bun run e2e:requests
 *
 * Run in hygiene, so in preflight and CI.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkE2eRequests } from "./lib/e2e-requests-rules.ts"

const DIR = "e2e/console"

// The whole tree, as Playwright's `testDir` is.
const files = readdirSync(DIR, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ path: join(DIR, name), source: readFileSync(join(DIR, name), "utf8") }))

const errors = checkE2eRequests(files)
if (errors.length > 0) {
  console.error("\ne2e:requests failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`e2e:requests: ${files.length} files, every API call sealed`)

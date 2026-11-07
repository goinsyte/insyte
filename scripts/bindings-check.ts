/*
 * Each Worker's wrangler config against its `Env` declaration (08 §2; the rules are in `lib/bindings-rules.ts`).
 *
 *   bun run bindings:check
 */
import { readFileSync } from "node:fs"
import { bindingsOf, checkBindings, envMembersOf } from "./lib/bindings-rules.ts"
import { parseJsonc } from "./lib/jsonc.ts"

const WORKERS = [
  { name: "insyte-api", config: "apps/api/wrangler.jsonc", env: "apps/api/src/platform/Env.ts" },
  { name: "insyte-console", config: "apps/console/wrangler.jsonc", env: "apps/console/src/env.d.ts" }
]

const errors = WORKERS.flatMap((w) =>
  checkBindings(
    w.name,
    bindingsOf(parseJsonc(readFileSync(w.config, "utf8")) as Record<string, unknown>),
    envMembersOf(readFileSync(w.env, "utf8"))
  )
)
if (errors.length > 0) {
  console.error("\nbindings:check failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`bindings:check: ${WORKERS.map((w) => w.name).join(", ")} agree with their Env`)

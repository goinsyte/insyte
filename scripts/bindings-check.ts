/*
 * Each Worker's wrangler config against its `Env` declaration (08 §2; the rules are in `lib/bindings-rules.ts`).
 *
 *   bun run bindings:check
 */
import { readFileSync } from "node:fs"
import { bindingsOf, checkBindings, envMembersOf } from "./lib/bindings-rules.ts"
import { parseJsonc } from "./lib/jsonc.ts"

/** What the deployed stages give the Workers (`infra/app.ts`): a deploy-only binding is one of its `NAME: Cloudflare.…`. */
const infra = readFileSync("infra/app.ts", "utf8")
const inInfra = (name: string) => new RegExp(`\\b${name}: Cloudflare\\.`).test(infra)

const WORKERS = [
  // Workers AI (M15 step 7) exists only on Cloudflare: no local simulator, so not in wrangler.jsonc (lib/bindings-rules.ts).
  { name: "insyte-api", config: "apps/api/wrangler.jsonc", env: "apps/api/src/platform/Env.ts", deployOnly: ["AI"] },
  { name: "insyte-console", config: "apps/console/wrangler.jsonc", env: "apps/console/src/env.d.ts", deployOnly: [] }
]

const errors = WORKERS.flatMap((w) =>
  checkBindings(
    w.name,
    bindingsOf(parseJsonc(readFileSync(w.config, "utf8")) as Record<string, unknown>),
    envMembersOf(readFileSync(w.env, "utf8")),
    { names: w.deployOnly, provided: inInfra }
  )
)
if (errors.length > 0) {
  console.error("\nbindings:check failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`bindings:check: ${WORKERS.map((w) => w.name).join(", ")} agree with their Env`)

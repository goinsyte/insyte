/*
 * The built bundles against the rules in `lib/bundle-rules.ts` (08 §2).
 *
 *   bun run bundle:check     (after `bun run --filter @insyte/console build`, which builds the API beside it)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { checkApiSize, checkClientBundle } from "./lib/bundle-rules.ts"

const CLIENT = "apps/console/dist/client/assets"
// The console's build bundles the API as its auxiliary Worker, with the same config `wrangler deploy` reads.
const API = "apps/console/dist/insyte_api/index.js"

if (!existsSync(CLIENT) || !existsSync(API)) {
  console.error("bundle:check: build the console first: bun run --filter @insyte/console build")
  process.exit(1)
}

const client = readdirSync(CLIENT).filter((f) => f.endsWith(".js")).map((f) => ({
  name: join(CLIENT, f),
  content: readFileSync(join(CLIENT, f), "utf8")
}))
const apiGzip = gzipSync(readFileSync(API)).byteLength

const errors = [...checkClientBundle(client), ...checkApiSize(apiGzip)]
if (errors.length > 0) {
  console.error("\nbundle:check failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(
  `bundle:check: ${client.length} browser files with no server code; API ${(apiGzip / 1024).toFixed(0)} KiB gzipped`
)

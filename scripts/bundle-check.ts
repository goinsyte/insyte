/*
 * The built bundles against the rules in `lib/bundle-rules.ts` (08 §2).
 *
 *   bun run bundle:check     (after `bun run --filter @insyte/console build`, which builds the API beside it)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { CONSOLE_READS_LEFT, CUTOVER } from "../packages/ui/src/data-source/cutover.ts"
import { checkApiSize, checkClientBundle, checkNoDemoModules, checkSeamReads, seamReadsOf } from "./lib/bundle-rules.ts"

const CLIENT = "apps/console/dist/client/assets"
// The console's build bundles the API as its auxiliary Worker, with the same config `wrangler deploy` reads.
const API = "apps/console/dist/insyte_api/index.js"
// What each console bundle renders, written by the build's `insyte:module-list` plugin (apps/console/vite.config.ts).
const MODULES = ["client", "ssr"].map((environment) => ({
  environment,
  path: `apps/console/dist/modules.${environment}.json`
}))

if (!existsSync(CLIENT) || !existsSync(API) || MODULES.some((m) => !existsSync(m.path))) {
  console.error("bundle:check: build the console first: bun run --filter @insyte/console build")
  process.exit(1)
}

const client = readdirSync(CLIENT).filter((f) => f.endsWith(".js")).map((f) => ({
  name: join(CLIENT, f),
  content: readFileSync(join(CLIENT, f), "utf8")
}))
const apiGzip = gzipSync(readFileSync(API)).byteLength

// The demo seam (M18): no reference module ships, and the seam bindings the console still reads only shrink.
const root = `${process.cwd()}/`
const reads = new Map<string, Array<string>>()
const demoErrors = MODULES.flatMap(({ environment, path }) => {
  const own = (JSON.parse(readFileSync(path, "utf8")) as Array<string>)
    .filter((id) => id.startsWith(root) && !id.includes("/node_modules/"))
    .map((id) => id.slice(root.length))
  for (const file of own.filter((f) => /\.tsx?$/.test(f))) {
    for (const binding of seamReadsOf(file, readFileSync(file, "utf8"))) {
      const files = reads.get(binding) ?? []
      if (!files.includes(file)) reads.set(binding, [...files, file].toSorted())
    }
  }
  return checkNoDemoModules(environment, own)
})

const errors = [
  ...checkClientBundle(client),
  ...checkApiSize(apiGzip),
  ...demoErrors,
  ...checkSeamReads(reads, CUTOVER, CONSOLE_READS_LEFT)
]
if (errors.length > 0) {
  console.error("\nbundle:check failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
const cutOver = Object.values(CUTOVER).filter((b) => b.status === "api").length
console.log(
  `bundle:check: ${client.length} browser files with no server code and no demo module; ` +
    `${cutOver} seam bindings cut over, ${reads.size} still read by the console; ` +
    `API ${(apiGzip / 1024).toFixed(0)} KiB gzipped`
)

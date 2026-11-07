/*
 * The ring rules over the repo (08 §2; the rules are in `lib/boundaries-rules.ts`).
 *
 *   bun run boundaries
 *
 * Reads every TypeScript file under apps/, packages/ and infra/, skipping build output, dependencies, the vendored
 * Effect source and the generated route trees. Run in hygiene, so in preflight and CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { checkBoundaries, type Import, importsOf } from "./lib/boundaries-rules.ts"

const SKIP = new Set(["node_modules", "dist", ".wrangler", ".tanstack", ".tsbuildinfo", "coverage"])

const filesUnder = (dir: string): Array<string> => {
  let entries: Array<string>
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    if (SKIP.has(entry)) return []
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.tsx?$/.test(entry) && !entry.endsWith("routeTree.gen.ts") ? [path] : []
  })
}

const imports: Array<Import> = ["apps", "packages", "infra"].flatMap(filesUnder).flatMap((file) =>
  importsOf(readFileSync(file, "utf8")).map((specifier) => ({ file, specifier }))
)

const errors = checkBoundaries(imports)
if (errors.length > 0) {
  console.error("\nboundaries failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`boundaries: ${imports.length} imports checked`)

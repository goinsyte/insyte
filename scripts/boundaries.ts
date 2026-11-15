/*
 * The ring rules over the repo (08 §2; the rules are in `lib/boundaries-rules.ts`).
 *
 *   bun run boundaries
 *
 * Reads every TypeScript file under apps/, packages/ and infra/, skipping build output, dependencies, the vendored
 * Effect source and the generated route trees, for their imports and for the narrow doors to the database they call
 * (`checkDoors`). Run in hygiene, so in preflight and CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { checkBoundaries, checkDoors, type Import, importsOf, type Source } from "./lib/boundaries-rules.ts"

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

const sources: Array<Source> = ["apps", "packages", "infra"].flatMap(filesUnder).map((file) => ({
  file,
  text: readFileSync(file, "utf8")
}))
const imports: Array<Import> = sources.flatMap(({ file, text }) =>
  importsOf(text).map((specifier) => ({ file, specifier }))
)

const errors = [...checkBoundaries(imports), ...checkDoors(sources)]
if (errors.length > 0) {
  console.error("\nboundaries failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error()
  process.exit(1)
}
console.log(`boundaries: ${imports.length} imports checked`)

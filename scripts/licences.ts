/*
 * The production dependencies of every deployed app, against `lib/licence-rules.ts` (08 §2).
 *
 *   bun run licences
 *
 * Walks `dependencies` (not devDependencies) from each app's package.json through node_modules, the way Node resolves
 * them from the package's own directory.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join } from "node:path"
import { isAllowed, isExcepted, licenceOf } from "./lib/licence-rules.ts"

const APPS = ["apps/api", "apps/console", "apps/marketing", "apps/design"]

interface Pkg {
  readonly name: string
  readonly version: string
  readonly license?: unknown
  readonly licenses?: unknown
  readonly dependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
}

/** `dep`'s directory as seen from `fromDir`: the nearest node_modules/dep up the tree. */
const locate = (dep: string, fromDir: string): string | undefined => {
  for (let dir = fromDir;; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", dep)
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}

const seen = new Map<string, Pkg>()
const walk = (dir: string, isWorkspace: boolean) => {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Pkg
  const id = `${pkg.name}@${pkg.version}`
  if (seen.has(id)) return
  if (!isWorkspace) seen.set(id, pkg)
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    const found = locate(dep, dir)
    if (found !== undefined) walk(found, found.includes("/packages/") && !found.includes("node_modules"))
  }
}
for (const app of APPS) walk(realpathSync(app), true)

const refused = [...seen.entries()].filter(([, pkg]) => {
  const licence = licenceOf(pkg)
  return licence === undefined || !(isAllowed(licence) || isExcepted(pkg.name, licence))
})
if (refused.length > 0) {
  console.error("\nlicences: not on the allow list:")
  for (const [id, pkg] of refused) console.error(`  ${id}: ${licenceOf(pkg) ?? "no licence field"}`)
  console.error()
  process.exit(1)
}
console.log(`licences: ${seen.size} production packages, all permissive`)

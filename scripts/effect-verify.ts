/*
 * The Effect pin, the vendored source and the installed package agree (04 header, 08 §5).
 *
 * `repos/effect` is the source agents and reviewers read; the catalog is what runs. If they drift, every
 * answer read from the source can be wrong for the code that runs. A version bump moves the subtree
 * and the catalog in the same pull request, and this fails until both have moved.
 *
 *   bun run effect:verify
 *
 * Checks, all against the root catalog:
 * - the Effect family (`effect`, `@effect/*`) is pinned exactly, to one version;
 * - that version is the vendored `repos/effect/packages/effect` and the installed `effect`;
 * - each `@effect/*` pin matches its vendored package;
 * - the other exact pins (alchemy with `@alchemy.run/*`, wrangler, the workers vitest plugin and types) carry no range.
 */
import installed from "effect/package.json" with { type: "json" }
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const VENDORED = "repos/effect/packages"
const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/
const PINNED_EXACTLY = [
  "alchemy",
  "@alchemy.run/",
  "wrangler",
  "@cloudflare/vitest-plugin",
  "@cloudflare/workers-types"
]

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string }

const root = JSON.parse(readFileSync("package.json", "utf8")) as { workspaces: { catalog: Record<string, string> } }
const catalog = Object.entries(root.workspaces.catalog)

// Every package.json under the vendored packages, by name: `packages/sql/pg` is `@effect/sql-pg`.
const vendored = new Map<string, string>()
const walk = (dir: string, depth: number): void => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (entry === "node_modules" || !statSync(path).isDirectory()) continue
    try {
      const pkg = readJson(join(path, "package.json"))
      if (pkg.name && pkg.version) vendored.set(pkg.name, pkg.version)
    } catch {
      // not a package; its children may be
    }
    if (depth > 0) walk(path, depth - 1)
  }
}
walk(VENDORED, 2)

const errors: string[] = []
const pin = root.workspaces.catalog["effect"]
const source = vendored.get("effect")

if (pin === undefined) errors.push("the catalog has no `effect` entry")
else {
  if (source !== pin) errors.push(`catalog pins effect ${pin}, ${VENDORED}/effect is ${source ?? "missing"}`)
  if (installed.version !== pin) errors.push(`catalog pins effect ${pin}, node_modules has ${installed.version}`)
}

for (const [name, version] of catalog) {
  const family = name === "effect" || name.startsWith("@effect/")
  if (family) {
    if (!EXACT.test(version)) errors.push(`${name} is "${version}": the Effect family is pinned exactly`)
    else if (version !== pin) errors.push(`${name} is ${version}, effect is ${pin}: the family moves together`)
    const own = vendored.get(name)
    if (own !== undefined && own !== version) errors.push(`${name} pins ${version}, the vendored source is ${own}`)
  } else if (PINNED_EXACTLY.some((p) => name === p || (p.endsWith("/") && name.startsWith(p)))) {
    if (!EXACT.test(version)) errors.push(`${name} is "${version}": pinned exactly (08 §5)`)
  }
}

const alchemy = [
  ...new Set(catalog.filter(([n]) => n === "alchemy" || n.startsWith("@alchemy.run/")).map(([, v]) => v))
]
if (alchemy.length > 1) {
  errors.push(`alchemy and @alchemy.run/* differ (${alchemy.join(", ")}): they are bumped together`)
}

if (errors.length > 0) {
  console.error("\neffect:verify failed:")
  for (const e of errors) console.error(`  ${e}`)
  console.error("\nA bump moves the catalog and `repos/effect` together: git subtree pull --prefix repos/effect …\n")
  process.exit(1)
}
console.log(`effect ${pin}: catalog, ${VENDORED} and node_modules agree`)

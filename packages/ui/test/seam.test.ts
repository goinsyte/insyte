import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CONSOLE_READS_LEFT, CUTOVER, type SeamStatus } from "../src/data-source/cutover.ts"

/*
 * The seam and its cut-over list agree (08 §2, "Seam"): every binding the data seam exports has a status, and the
 * console's own code imports none of them. That a binding cut over to the API is read by nothing in the console's
 * bundle, and that no fixture or demo module ships there, needs the built bundle: `bun run bundle:check` (M18).
 */

const SEAM = new URL("../src/data-source/index.ts", import.meta.url)

const seamExports = (source: string) => [...source.matchAll(/^export let (\w+)/gm)].map((m) => m[1]!)

const filesUnder = (dir: string): Array<string> =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(entry) ? [path] : []
  })

/** The seam names a file imports, from any import of the data-source module. */
const seamNamesIn = (source: string) =>
  [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']*data-source["']/g)]
    .flatMap((m) => m[1]!.split(",").map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!))
    .filter(Boolean)

const checkSeam = (
  exported: ReadonlyArray<string>,
  cutover: Record<string, { readonly status: SeamStatus }>,
  left: Record<string, ReadonlyArray<string>>,
  consoleReads: ReadonlyArray<string>
): Array<string> => {
  const errors: Array<string> = []
  for (const name of exported) if (!(name in cutover)) errors.push(`${name} is on the seam with no status`)
  for (const name of Object.keys(cutover)) {
    if (!exported.includes(name)) errors.push(`${name} has a status, not a binding`)
  }
  for (const name of Object.keys(left)) {
    if (cutover[name]?.status === "api") errors.push(`${name} is cut over, yet listed as still read by the console`)
  }
  for (const name of consoleReads.filter((n) => exported.includes(n))) {
    errors.push(`${name} is imported by the console's own code`)
  }
  return errors
}

const readersOf = (dir: string) => [...new Set(filesUnder(dir).flatMap((f) => seamNamesIn(readFileSync(f, "utf8"))))]

describe("the data seam", () => {
  it("matches its cut-over list, and the console reads no design control", () => {
    const root = new URL("../../../", import.meta.url).pathname
    expect(checkSeam(
      seamExports(readFileSync(SEAM, "utf8")),
      CUTOVER,
      CONSOLE_READS_LEFT,
      readersOf(join(root, "apps/console/src"))
    )).toEqual([])
  })

  it("has the 68 bindings 09-cutover.md lists, 27 cut over and the affiliate programme's 18 still demo (M16)", () => {
    const count = (status: SeamStatus) => Object.values(CUTOVER).filter((b) => b.status === status).length
    expect(Object.keys(CUTOVER)).toHaveLength(68)
    expect({ api: count("api"), code: count("code"), demoOnly: count("demo-only"), demo: count("demo") })
      .toEqual({ api: 27, code: 3, demoOnly: 7, demo: 31 })
  })

  it("fails a binding without a status, a cut-over binding still listed as read, and a console import", () => {
    expect(checkSeam(
      ["orders", "extra", "SCENARIO"],
      { orders: { status: "api" }, SCENARIO: { status: "demo-only" }, gone: { status: "demo" } },
      { orders: ["packages/ui/src/app/lib/api.ts"] },
      ["SCENARIO", "Order"]
    )).toEqual([
      "extra is on the seam with no status",
      "gone has a status, not a binding",
      "orders is cut over, yet listed as still read by the console",
      "SCENARIO is imported by the console's own code"
    ])
  })
})

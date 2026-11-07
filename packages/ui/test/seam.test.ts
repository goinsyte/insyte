import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CUTOVER, type SeamStatus } from "../src/data-source/cutover.ts"

/*
 * The seam and its cut-over list agree (08 §2, "Seam"): every binding the data seam exports has a status, a binding cut
 * over to the API is read by no screen any more, and a design control (`demo-only`) never reaches the console.
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
  readers: { readonly screens: ReadonlyArray<string>; readonly console: ReadonlyArray<string> }
): Array<string> => {
  const errors: Array<string> = []
  for (const name of exported) if (!(name in cutover)) errors.push(`${name} is on the seam with no status`)
  for (const name of Object.keys(cutover)) {
    if (!exported.includes(name)) errors.push(`${name} has a status, not a binding`)
  }
  for (const [name, { status }] of Object.entries(cutover)) {
    if (status === "api" && readers.screens.includes(name)) {
      errors.push(`${name} is cut over, yet a screen still reads it`)
    }
    if (status === "demo-only" && readers.console.includes(name)) {
      errors.push(`${name} is a design control in the console`)
    }
  }
  return errors
}

const readersOf = (dir: string) => [...new Set(filesUnder(dir).flatMap((f) => seamNamesIn(readFileSync(f, "utf8"))))]

describe("the data seam", () => {
  it("matches its cut-over list, and the console reads no design control", () => {
    const root = new URL("../../../", import.meta.url).pathname
    expect(checkSeam(seamExports(readFileSync(SEAM, "utf8")), CUTOVER, {
      screens: readersOf(join(root, "packages/ui/src/app")),
      console: readersOf(join(root, "apps/console/src"))
    })).toEqual([])
  })

  it("has the 68 bindings 09-cutover.md lists, none cut over yet", () => {
    expect(Object.keys(CUTOVER)).toHaveLength(68)
    expect(Object.values(CUTOVER).filter((b) => b.status === "api")).toEqual([])
  })

  it("fails a binding without a status, a cut-over binding a screen still reads, and a design control in the console", () => {
    expect(checkSeam(["orders", "extra"], { orders: { status: "api" }, SCENARIO: { status: "demo-only" } }, {
      screens: ["orders"],
      console: ["SCENARIO"]
    })).toEqual([
      "extra is on the seam with no status",
      "SCENARIO has a status, not a binding",
      "orders is cut over, yet a screen still reads it",
      "SCENARIO is a design control in the console"
    ])
  })
})

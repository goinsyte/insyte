import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseJsonc } from "../lib/jsonc.ts"

/*
 * The ported files have graduated (08 §3, M18 "Ported files"): lint and knip hold the screens, stores and route
 * statements to this repo's rules, and their exclusion lists keep only what is still a byte-identical port (the
 * component library) or a fixture. A new exclusion under the product's code fails here.
 */

const read = (path: string) => parseJsonc(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"))

const PORTED_STILL = [
  "packages/ui/src/components/**",
  "packages/ui/src/data-source/types.ts",
  "apps/design/src/app/fixtures/mock-data/**",
  "apps/design/src/app/fixtures/scenario.ts",
  "apps/design/src/app/fixtures/affiliate-data.ts"
]

describe("graduation", () => {
  it("lints every file of the product but the component library and the fixtures", () => {
    const { ignorePatterns } = read(".oxlintrc.json") as { ignorePatterns: ReadonlyArray<string> }
    expect(ignorePatterns.filter((p) => /^!?(packages\/ui|apps\/design\/src\/app)\//.test(p))).toEqual(PORTED_STILL)
  })

  it("reports unused code in packages/ui like anywhere else", () => {
    const { workspaces } = read("knip.jsonc") as { workspaces: Record<string, { ignore?: ReadonlyArray<string> }> }
    expect(workspaces["packages/ui"]?.ignore ?? []).toEqual([])
  })
})

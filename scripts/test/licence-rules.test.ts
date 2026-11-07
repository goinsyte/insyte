import { describe, expect, it } from "vitest"
import { isAllowed, isExcepted, licenceOf } from "../lib/licence-rules.ts"

describe("licences", () => {
  it("allows permissive licences and expressions with a permissive way out", () => {
    expect(isAllowed("MIT")).toBe(true)
    expect(isAllowed("(MIT OR GPL-3.0)")).toBe(true)
    expect(isAllowed("Apache-2.0 AND MIT")).toBe(true)
  })

  it("refuses copyleft and anything unnamed", () => {
    expect(isAllowed("GPL-3.0")).toBe(false)
    expect(isAllowed("AGPL-3.0-only")).toBe(false)
    expect(isAllowed("MIT AND GPL-2.0")).toBe(false)
    expect(isAllowed("UNLICENSED")).toBe(false)
  })

  it("excepts a font licence for font packages only", () => {
    expect(isExcepted("@fontsource-variable/inter", "OFL-1.1")).toBe(true)
    expect(isExcepted("some-library", "OFL-1.1")).toBe(false)
  })

  it("reads the licence field in its old shapes", () => {
    expect(licenceOf({ license: { type: "MIT" } })).toBe("MIT")
    expect(licenceOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0")
    expect(licenceOf({})).toBeUndefined()
  })
})

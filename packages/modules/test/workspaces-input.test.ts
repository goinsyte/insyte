import { describe, expect, it } from "vitest"
import { validateWorkspace } from "../src/shared/domain/Workspaces.ts"

describe("validateWorkspace", () => {
  it("trims and lower-cases what it accepts", () => {
    expect(validateWorkspace({ name: "  Allure Co. ", slug: "Allure-Co", country: "NL", teamSize: "2-5" })).toEqual({
      ok: { name: "Allure Co.", slug: "allure-co", country: "NL", teamSize: "2-5" }
    })
  })

  it("names each failing field with a reason code, never a sentence", () => {
    expect(validateWorkspace({ name: " ", slug: "-bad-", country: "XX", teamSize: "huge" })).toEqual({
      fields: { name: "required", slug: "format", country: "invalid", teamSize: "invalid" }
    })
    expect(validateWorkspace({ name: "a".repeat(81), slug: "", country: "NL", teamSize: "1" })).toEqual({
      fields: { name: "too_long", slug: "required" }
    })
  })
})

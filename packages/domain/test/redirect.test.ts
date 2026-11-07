import { describe, expect, it } from "vitest"
import { safeRedirect } from "../src/Redirect.ts"

describe("safeRedirect", () => {
  it.each([
    "/orders",
    "/orders/ord_01jc5x3k8m9n0p1q2r3s4t5v6w",
    "/settings/team?tab=roles",
    "/dashboard#today"
  ])("lets %s through", (path) => {
    expect(safeRedirect(path)).toBe(path)
  })

  it.each([
    ["an absolute URL", "https://evil.example/orders"],
    ["a protocol-relative URL", "//evil.example/orders"],
    ["a backslash trick", "/\\evil.example"],
    ["a scheme in the first segment", "/javascript:alert(1)"],
    ["a path outside the console", "/api/auth/sign-out"],
    ["the empty string", ""],
    ["a non-string", 42],
    ["a control character", "/orders\n"],
    ["more than 512 characters", `/orders/${"x".repeat(520)}`]
  ])("drops %s", (_, value) => {
    expect(safeRedirect(value)).toBeUndefined()
  })
})

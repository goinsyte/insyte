import { describe, expect, it } from "vitest"
import { authErrorCopy } from "../src/app/lib/errors.ts"

describe("authErrorCopy", () => {
  it("turns better-auth's codes into Dutch a person can act on", () => {
    expect(authErrorCopy("INVALID_EMAIL_OR_PASSWORD", "x")).toBe("Dit e-mailadres en wachtwoord horen niet bij elkaar.")
    expect(authErrorCopy("EMAIL_NOT_VERIFIED", "x")).toMatch(/^Bevestig eerst je e-mailadres/)
    expect(authErrorCopy("INVALID_TOKEN", "x")).toMatch(/verlopen/)
  })

  it("falls back to the screen's own line for a code it does not know, or none", () => {
    expect(authErrorCopy("SOMETHING_NEW", "Inloggen mislukt.")).toBe("Inloggen mislukt.")
    expect(authErrorCopy(undefined, "Inloggen mislukt.")).toBe("Inloggen mislukt.")
  })
})

describe("serverFormMessage", () => {
  it("reads the form-level message TanStack Form keeps as a string, and the object shape", async () => {
    const { serverFormMessage } = await import("../src/app/lib/form-errors.ts")
    expect(serverFormMessage("Dit e-mailadres en wachtwoord horen niet bij elkaar.")).toBe(
      "Dit e-mailadres en wachtwoord horen niet bij elkaar."
    )
    expect(serverFormMessage({ form: "Inloggen mislukt." })).toBe("Inloggen mislukt.")
    expect(serverFormMessage(undefined)).toBeUndefined()
    expect(serverFormMessage("")).toBeUndefined()
  })
})

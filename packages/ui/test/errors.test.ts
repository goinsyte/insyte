import { describe, expect, it } from "vitest"
import { authErrorCopy } from "../src/app/lib/errors.ts"

describe("authErrorCopy", () => {
  it("turns better-auth's codes into Dutch a person can act on", () => {
    expect(authErrorCopy("INVALID_EMAIL_OR_PASSWORD", "x")).toBe("E-mailadres of wachtwoord klopt niet.")
    expect(authErrorCopy("PASSWORD_BREACHED", "x")).toBe(
      "Dit wachtwoord komt voor in bekende datalekken. Kies een ander."
    )
    expect(authErrorCopy("EMAIL_NOT_VERIFIED", "x")).toMatch(/^Bevestig eerst je e-mailadres/)
    expect(authErrorCopy("INVALID_TOKEN", "x")).toMatch(/verlopen/)
  })

  it("names the wait of a rate limit in whole minutes, rounded up", () => {
    expect(authErrorCopy("RATE_LIMITED", "x", 900)).toBe("Te veel pogingen. Probeer het over 15 minuten opnieuw.")
    expect(authErrorCopy("RATE_LIMITED", "x", 61)).toBe("Te veel pogingen. Probeer het over 2 minuten opnieuw.")
    expect(authErrorCopy("RATE_LIMITED", "x", 30)).toBe("Te veel pogingen. Probeer het over 1 minuut opnieuw.")
    expect(authErrorCopy("RATE_LIMITED", "x")).toBe("Te veel pogingen. Wacht even en probeer het opnieuw.")
  })

  it("falls back to the screen's own line for a code it does not know, or none", () => {
    expect(authErrorCopy("SOMETHING_NEW", "Inloggen mislukt.")).toBe("Inloggen mislukt.")
    expect(authErrorCopy(undefined, "Inloggen mislukt.")).toBe("Inloggen mislukt.")
  })
})

describe("serverFormMessage", () => {
  it("reads the form-level message TanStack Form keeps as a string, and the object shape", async () => {
    const { serverFormMessage } = await import("../src/app/lib/form-errors.ts")
    expect(serverFormMessage("E-mailadres of wachtwoord klopt niet.")).toBe("E-mailadres of wachtwoord klopt niet.")
    expect(serverFormMessage({ form: "Inloggen mislukt." })).toBe("Inloggen mislukt.")
    expect(serverFormMessage(undefined)).toBeUndefined()
    expect(serverFormMessage("")).toBeUndefined()
  })
})

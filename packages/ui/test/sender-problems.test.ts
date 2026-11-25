import { describe, expect, it } from "vitest"
import { senderProblems } from "../src/app/lib/settings-depth.ts"

/*
 * E-mail en domein's senders, checked as they are typed: what the server refuses (`settings/domain/Check.ts`) is said
 * at the field before saving, so the bar never saves an address that cannot go.
 */

describe("E-mail en domein's senders", () => {
  it("takes empty senders: Insyte's own address stays", () => {
    expect(senderProblems("", "", "")).toEqual({})
    expect(senderProblems("  ", "", "jouwwinkel.nl")).toEqual({})
  })

  it("asks for an address on the domain set up here, and for a domain first", () => {
    expect(senderProblems("support@jouwwinkel.nl", "", "jouwwinkel.nl")).toEqual({})
    expect(senderProblems("Support@JouwWinkel.nl", "", "jouwwinkel.nl")).toEqual({})
    expect(senderProblems("support@elders.nl", "", "jouwwinkel.nl")).toEqual({
      from: "Gebruik een adres op jouwwinkel.nl."
    })
    expect(senderProblems("support@jouwwinkel.nl", "", "").from).toMatch(/^Stel eerst je domein in/)
    expect(senderProblems("geen-mail", "", "jouwwinkel.nl").from).toBe("Dit is geen geldig e-mailadres.")
    // Longer than an address may be (254), as the server refuses it.
    const long = `${"a".repeat(250)}@jouwwinkel.nl`
    expect(senderProblems(long, long, "jouwwinkel.nl")).toEqual({
      from: "Dit is geen geldig e-mailadres.",
      replyTo: "Dit is geen geldig e-mailadres."
    })
  })

  it("asks for a real address to answer to", () => {
    expect(senderProblems("", "klantenservice@jouwwinkel.nl", "")).toEqual({})
    expect(senderProblems("", "Klant <x@y.nl>", "")).toEqual({ replyTo: "Dit is geen geldig e-mailadres." })
  })
})

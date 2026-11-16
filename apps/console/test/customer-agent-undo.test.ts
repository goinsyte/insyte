import { describe, expect, it } from "vitest"
import { undoRefusal } from "../src/agent/customer-agent-undo.ts"

/*
 * Undoing a Klantagent save the server refuses (M15 step 8): each refusal says why, not only "too late".
 */

describe("undoing a Klantagent save", () => {
  it("says the settings changed meanwhile on a conflict", () => {
    expect(undoRefusal({ _tag: "Conflict", entity: "customer_agent", reason: "changed" })).toEqual({
      title: "Niet ongedaan gemaakt",
      description: "Er is intussen iets anders opgeslagen."
    })
  })

  it("says the role may not put them back when it is forbidden", () => {
    expect(undoRefusal({ _tag: "Forbidden" }).description).toContain("Je rol mag deze instellingen niet terugzetten")
  })

  it("says it is too late otherwise", () => {
    expect(undoRefusal({ _tag: "NotFound" })).toEqual({ title: "Te laat om ongedaan te maken" })
    expect(undoRefusal(undefined)).toEqual({ title: "Te laat om ongedaan te maken" })
  })
})

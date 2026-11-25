import { describe, expect, it } from "vitest"
import { foldName, roleForCell } from "../src/app/team/csv-roles.ts"

// The workspace's roles as Team's source has them: the owner first, then the system roles and a custom one.
const ROLES = [
  { id: "owner", label: "Eigenaar" },
  { id: "admin", label: "Beheerder" },
  { id: "service", label: "Klantenservice" },
  { id: "finance", label: "Financiën" },
  { id: "view", label: "Alleen lezen" },
  { id: "rol_1", label: "Retourbalie" }
]

describe("the role a CSV row names", () => {
  it("reads a name as a person types it: case, accents and spaces aside", () => {
    expect(foldName("  Financiën ")).toBe("financien")
    expect(roleForCell(ROLES, "financien")).toEqual({ ok: true, id: "finance" })
    expect(roleForCell(ROLES, "FINANCIËN")).toEqual({ ok: true, id: "finance" })
    expect(roleForCell(ROLES, "alleen  lezen")).toEqual({ ok: true, id: "view" })
    expect(roleForCell(ROLES, "retourbalie")).toEqual({ ok: true, id: "rol_1" })
    // By its id too.
    expect(roleForCell(ROLES, "service")).toEqual({ ok: true, id: "service" })
  })

  it("leaves a row without a role to the dialog's own choice", () => {
    expect(roleForCell(ROLES, "")).toBeUndefined()
    expect(roleForCell(ROLES, "   ")).toBeUndefined()
  })

  it("stops a row whose role does not exist, instead of quietly giving it another", () => {
    expect(roleForCell(ROLES, "Magazijn")).toEqual({
      ok: false,
      reason: "Rol \"Magazijn\" bestaat niet, kies een rol uit Rollen"
    })
  })

  it("never lets a CSV make someone the owner, and says so by the owner's name", () => {
    expect(roleForCell(ROLES, "Eigenaar")).toEqual({
      ok: false,
      reason: "Eigenaar kun je niet uitnodigen, kies een andere rol"
    })
    expect(roleForCell(ROLES, "owner")).toMatchObject({ ok: false })
  })
})

import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * Rollen on the server (step 5.3, M3.2), through the Worker: the five system roles with who holds them; a custom role
 * made from another, edited (clamped by the catalogue), renamed, deleted with its holders moved and put back by the
 * undo; a system role changed and restored to its default; and the owner's role never changed.
 */

describe("roles", () => {
  let owner = { email: "", cookie: "" }
  let custom = ""

  it("lists the five roles every workspace has, the owner first, with the founder holding it", async () => {
    owner = await person("roles-owner", "Roles Co.")
    const roles = ok(await rpc("Roles.list", undefined, owner.cookie))
    expect(roles.roles.map((r) => r.id)).toEqual(["owner", "admin", "service", "finance", "view"])
    expect(roles.myRoleId).toBe("owner")
    expect(roles.roles[0]!.holders.members.map((m) => m.name)).toEqual(["Persoon roles-owner"])
  })

  it("makes a role from another, and refuses an empty or taken name", async () => {
    const created = ok(await rpc("Roles.create", { label: " Retourbalie ", from: "service" }, owner.cookie))
    custom = created.id
    const role = created.roles.roles.find((r) => r.id === custom)!
    expect(role).toMatchObject({ label: "Retourbalie", system: false, basedOn: "service", refundLimit: 100 })
    expect(role.levels["support"]).toBe(3)
    expect(failure(await rpc("Roles.create", { label: "retourbalie", from: null }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { label: "taken" }
    })
    expect(failure(await rpc("Roles.create", { label: "  ", from: null }, owner.cookie))).toMatchObject({
      fields: { label: "required" }
    })
  })

  it("edits a role through the catalogue: levels clamped, the version up", async () => {
    const before = ok(await rpc("Roles.list", undefined, owner.cookie)).roles.find((r) => r.id === custom)!
    const after = ok(
      await rpc("Roles.update", {
        id: custom,
        // Analyse has no Bewerken or Beheren: 3 becomes 1.
        levels: { ...before.levels, analytics: 3, returns: 3 },
        specials: { ...before.specials, "refunds.write": true },
        refundLimit: 250,
        stores: "all"
      }, owner.cookie)
    ).roles.find((r) => r.id === custom)!
    expect(after.levels["analytics"]).toBe(1)
    expect(after.levels["returns"]).toBe(3)
    expect(after.refundLimit).toBe(250)
    expect(after.version).toBe(before.version + 1)
    expect(
      ok(await rpc("Roles.rename", { id: custom, label: "Retouren" }, owner.cookie)).roles.find((r) => r.id === custom)
        ?.label
    )
      .toBe("Retouren")
  })

  it("never changes the owner's role, and keeps system roles' names", async () => {
    const owners = ok(await rpc("Roles.list", undefined, owner.cookie)).roles[0]!
    expect(
      failure(
        await rpc("Roles.update", {
          id: "owner",
          levels: owners.levels,
          specials: owners.specials,
          refundLimit: null,
          stores: "all"
        }, owner.cookie)
      )
    )
      .toMatchObject({ _tag: "Conflict", reason: "owner" })
    expect(failure(await rpc("Roles.rename", { id: "service", label: "Support" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "system"
    })
  })

  it("changes a system role and puts it back to its default", async () => {
    const view = ok(await rpc("Roles.list", undefined, owner.cookie)).roles.find((r) => r.id === "view")!
    const changed = ok(
      await rpc("Roles.update", {
        id: "view",
        levels: { ...view.levels, team: 0 },
        specials: view.specials,
        refundLimit: null,
        stores: "all"
      }, owner.cookie)
    )
    expect(changed.roles.find((r) => r.id === "view")?.levels["team"]).toBe(0)
    const reset = ok(await rpc("Roles.reset", { id: "view" }, owner.cookie))
    expect(reset.roles.find((r) => r.id === "view")?.levels["team"]).toBe(1)
  })

  it("deletes a custom role, moving whoever holds it, and the undo puts the role and them back", async () => {
    // The shareable link grants it, so deleting moves the link.
    ok(await rpc("InviteLink.set", { enabled: true, roleId: custom }, owner.cookie))
    const gone = ok(await rpc("Roles.remove", { id: custom, to: "view" }, owner.cookie))
    expect(gone.roles.map((r) => r.id)).not.toContain(custom)
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).link.roleId).toBe("view")
    expect(failure(await rpc("Roles.remove", { id: "service", to: "view" }, owner.cookie))).toMatchObject({
      _tag: "Conflict"
    })

    const back = ok(await rpc("Roles.restore", { id: custom }, owner.cookie))
    expect(back.roles.find((r) => r.id === custom)?.label).toBe("Retouren")
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).link.roleId).toBe(custom)
  })

  it("lets whoever may see the team read the roles, and nobody else change them", async () => {
    const loner = await person("roles-loner")
    expect(failure(await rpc("Roles.list", undefined, loner.cookie))).toMatchObject({ _tag: "NoWorkspace" })
    expect(ok(await sessionMe(owner.cookie)).activePrincipal?.roleLabel).toBe("Eigenaar")
  })
})

import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { rpc } from "./support.ts"

/*
 * Instellingen → API-sleutels on the server (step 6.1, M19.1): a key is made with its secret shown once, follows a role
 * or holds scopes the catalogue clamps (the team is read-only for keys), is renamed and narrowed to addresses, rotated
 * with a grace for the old token, revoked and put back; key management itself stays with people who manage it.
 */

describe("API keys", () => {
  let owner = { email: "", cookie: "" }
  let keyId = ""
  let secret = ""

  it("makes a key bound to a role and shows its secret once", async () => {
    owner = await person("keys-owner", "Keys Co.")
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie))).toEqual([])
    const made = ok(
      await rpc("ApiKeys.create", {
        label: " Voorraadfeed ",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 90,
        ips: [],
        agent: false
      }, owner.cookie)
    )
    keyId = made.key.id
    secret = made.secret
    expect(secret).toMatch(/^ins_live_[a-z0-9]{12}_[A-Za-z0-9]{32}$/)
    expect(made.key).toMatchObject({
      label: "Voorraadfeed",
      status: "active",
      access: { kind: "role", roleId: "view" }
    })
    expect(secret.startsWith(made.key.prefix)).toBe(true)
    expect(made.key.expiresAt! - made.key.createdAt).toBeGreaterThan(89 * 86_400_000)
    // The list never carries a secret.
    const [listed] = ok(await rpc("ApiKeys.list", undefined, owner.cookie))
    expect(JSON.stringify(listed)).not.toContain(secret.slice(-32))
  })

  it("clamps custom scopes by the catalogue, and refuses the owner's role and a bad address", async () => {
    const custom = ok(
      await rpc("ApiKeys.create", {
        label: "Agent",
        access: { kind: "custom", scopes: { team: 2, orders: 2, billing: 2 } },
        stores: "all",
        expiresInDays: null,
        ips: ["192.168.1.0/24"],
        agent: true
      }, owner.cookie)
    ).key
    expect(custom.access).toMatchObject({ kind: "custom", scopes: { team: 1, orders: 2 } })
    expect(custom.access.kind === "custom" ? custom.access.scopes["billing"] : undefined).toBeUndefined()
    expect(custom).toMatchObject({ agent: true, ips: ["192.168.1.0/24"], expiresAt: null })
    expect(failure(
      await rpc("ApiKeys.create", {
        label: "Alles",
        access: { kind: "role", roleId: "owner" },
        stores: "all",
        expiresInDays: null,
        ips: [],
        agent: false
      }, owner.cookie)
    )).toMatchObject({ _tag: "Invalid", fields: { access: "owner" } })
    expect(failure(await rpc("ApiKeys.update", { id: keyId, ips: ["geen-adres"] }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { ips: "format" }
    })
  })

  it("rotates with a grace for the old token, and ends it early", async () => {
    const rotated = ok(await rpc("ApiKeys.rotate", { id: keyId, graceMs: 3_600_000 }, owner.cookie))
    expect(rotated.secret).not.toBe(secret)
    expect(rotated.key.rotated?.previousPrefix).toBe(secret.slice(0, 13))
    const ended = ok(await rpc("ApiKeys.endGrace", { id: keyId }, owner.cookie))
    expect(ended.find((k) => k.id === keyId)?.rotated).toBeNull()
  })

  it("revokes and puts a key back, and keeps key management with whoever manages integrations", async () => {
    const revoked = ok(await rpc("ApiKeys.revoke", { id: keyId }, owner.cookie))
    expect(revoked.find((k) => k.id === keyId)).toMatchObject({ status: "revoked" })
    expect(failure(await rpc("ApiKeys.rotate", { id: keyId, graceMs: 0 }, owner.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    const back = ok(await rpc("ApiKeys.restore", { id: keyId }, owner.cookie))
    expect(back.find((k) => k.id === keyId)).toMatchObject({ status: "active" })
    expect(
      ok(await rpc("ApiKeys.update", { id: keyId, label: "Feed" }, owner.cookie)).find((k) => k.id === keyId)?.label
    )
      .toBe("Feed")
    const activity = ok(await rpc("ApiKeys.activity", { id: keyId }, owner.cookie))
    expect(activity.requests).toEqual([])
    expect(activity.usage).toHaveLength(14)
    expect(activity.usage.every((d) => d.count === 0)).toBe(true)
  })
})

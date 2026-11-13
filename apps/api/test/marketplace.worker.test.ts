import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The Marketplace on the server (step 20.3, M17 step 3). The catalogue is the code's. A recipe app (Zapier) gets an API
 * key of its own, shown once: its triggers' areas, reading only, never more than the installer's role and stores. It
 * is narrowed or widened (to that ceiling) when scopes change (with Undo) and revoked with the app (Undo puts both
 * back, but never a key revoked by anyone else). A connector app (Klaviyo) is installed when its connection is: the install names the connect flow, and the
 * app can only go once the connection has. An app without either says Binnenkort. Feedback is kept.
 */

const connectKlaviyo = async (cookie: string) => {
  const { authorizeUrl } = ok(await rpc("Marketing.beginConnect", { returnPath: "/settings/apps" }, cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  return call(`http://api.test/api/connect/klaviyo/callback?${new URLSearchParams({ code: "abc", state })}`, {
    headers: { cookie },
    redirect: "manual"
  })
}

describe("the Marketplace", () => {
  let owner = { email: "", cookie: "" }

  it("serves the catalogue and its shelves, and suggests what suits an empty workspace", async () => {
    owner = await person("market-owner", "Market Co.")
    const catalog = ok(await rpc("Marketplace.catalog", undefined, owner.cookie))
    expect(catalog.apps).toHaveLength(12)
    expect(catalog.apps.find((a) => a.id === "ext_zapier")?.install).toEqual({
      kind: "key",
      areas: ["orders", "customers", "support", "chargebacks"],
      write: false,
      expiresInDays: null
    })
    expect(catalog.apps.find((a) => a.id === "ext_klaviyo")?.install).toEqual({ kind: "connect", provider: "klaviyo" })
    expect(catalog.collections.featured[0]).toBe("ext_klaviyo")
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie))).toEqual([])
    // No customers, orders or tickets yet: the editors' featured shelf, installable apps first.
    expect(ok(await rpc("Marketplace.recommended", undefined, owner.cookie))).toEqual([
      "ext_klaviyo",
      "ext_zapier",
      "ext_gorgias",
      "ext_aftership"
    ])
    expect(failure(await rpc("Marketplace.get", { appId: "ext_none" }, owner.cookie))).toMatchObject({
      _tag: "NotFound"
    })
  })

  it("installs a recipe app with a key of its own, narrows it, and takes it back with Undo", async () => {
    const made = ok(await rpc("Marketplace.install", { appId: "ext_zapier" }, owner.cookie))
    expect(made.connect).toBeNull()
    expect(made.key?.secret).toMatch(/^ins_live_[a-z0-9]{12}_[A-Za-z0-9]{32}$/)
    // Reading only, until writing is given back.
    expect(made.install).toMatchObject({
      appId: "ext_zapier",
      via: "app",
      revokedScopes: ["records.write"],
      lastOpenedAt: null
    })
    const keyOf = async () =>
      ok(await rpc("ApiKeys.list", undefined, owner.cookie)).find((k) => k.prefix === made.key?.prefix)
    // Its triggers' areas only, read only, in every store the owner has.
    expect(await keyOf()).toMatchObject({
      label: "Zapier",
      status: "active",
      stores: "all",
      expiresAt: null,
      access: { kind: "custom", scopes: { orders: 1, customers: 1, support: 1, chargebacks: 1 } }
    })
    const access = (await keyOf())?.access
    expect(Object.keys(access?.kind === "custom" ? access.scopes : {}).sort()).toEqual([
      "chargebacks",
      "customers",
      "orders",
      "support"
    ])
    expect(failure(await rpc("Marketplace.install", { appId: "ext_zapier" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "installed"
    })

    // Writing given back: the key writes where the owner may.
    const scoped = ok(await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: [] }, owner.cookie))
    expect(scoped.install.revokedScopes).toEqual([])
    expect((await keyOf())?.access).toMatchObject({ scopes: { orders: 2, customers: 2, support: 2, chargebacks: 2 } })
    // Writing taken back again, and that undone: the key writes again (the undo comes at once, inside its window).
    const narrowed = ok(
      await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: ["records.write"] }, owner.cookie)
    )
    ok(await rpc("Shared.undo", { token: narrowed.undo.token }, owner.cookie))
    expect((await keyOf())?.access).toMatchObject({ scopes: { orders: 2, customers: 2 } })
    expect(failure(
      await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: ["iets"] }, owner.cookie)
    )).toMatchObject({ _tag: "Invalid" })

    const opened = ok(await rpc("Marketplace.open", { appId: "ext_zapier" }, owner.cookie))
    expect(opened.lastOpenedAt).not.toBeNull()

    const gone = ok(await rpc("Marketplace.uninstall", { appId: "ext_zapier" }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie))).toEqual([])
    expect((await keyOf())?.status).toBe("revoked")
    ok(await rpc("Shared.undo", { token: gone.undo!.token }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])
    expect((await keyOf())?.status).toBe("active")
  })

  it("never brings back a key that was revoked on purpose", async () => {
    const keyOf = async () => ok(await rpc("ApiKeys.list", undefined, owner.cookie)).find((k) => k.label === "Zapier")!
    // Revoked under API-sleutels first: the uninstall's undo puts the app back, the key stays revoked.
    const key = await keyOf()
    ok(await rpc("ApiKeys.revoke", { id: key.id }, owner.cookie))
    const first = ok(await rpc("Marketplace.uninstall", { appId: "ext_zapier" }, owner.cookie))
    ok(await rpc("Shared.undo", { token: first.undo!.token }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])
    expect((await keyOf()).status).toBe("revoked")

    // Revoked by the uninstall, then put back and revoked again by hand: that later revocation stands too.
    ok(await rpc("ApiKeys.restore", { id: key.id }, owner.cookie))
    const second = ok(await rpc("Marketplace.uninstall", { appId: "ext_zapier" }, owner.cookie))
    ok(await rpc("ApiKeys.restore", { id: key.id }, owner.cookie))
    ok(await rpc("ApiKeys.revoke", { id: key.id }, owner.cookie))
    ok(await rpc("Shared.undo", { token: second.undo!.token }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])
    expect((await keyOf()).status).toBe("revoked")
  })

  it("never makes a key that reaches more than its installer: their levels and their stores", async () => {
    const boss = await person("market-boss", "Market Two")
    const workspace = ok(await sessionMe(boss.cookie)).principals[0]!.workspaceId
    const { id: roleId } = ok(await rpc("Roles.create", { label: "Koppelingen", from: null }, boss.cookie))
    const role = ok(await rpc("Roles.list", undefined, boss.cookie)).roles.find((r) => r.id === roleId)!
    ok(
      await rpc("Roles.update", {
        id: roleId,
        levels: { ...role.levels, integrations: 3, orders: 2, customers: 0, support: 1, chargebacks: 0 },
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: "all"
      }, boss.cookie)
    )
    const email = `market-${run}-linker@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId, stores: ["store_mkt_a"] }] }, boss.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const linker = await join(email)

    const made = ok(await rpc("Marketplace.install", { appId: "ext_zapier" }, linker))
    const keyOf = async () =>
      ok(await rpc("ApiKeys.list", undefined, linker)).find((k) => k.prefix === made.key?.prefix)!
    // Their one store, not every store; no customers or chargebacks, which their role cannot read.
    expect(await keyOf()).toMatchObject({
      stores: ["store_mkt_a"],
      access: { kind: "custom", scopes: { orders: 1, support: 1 } }
    })
    const scopes = async () => {
      const access = (await keyOf()).access
      return access.kind === "custom" ? access.scopes : {}
    }
    expect(Object.keys(await scopes()).sort()).toEqual(["orders", "support"])
    // Writing given back: only where their role writes.
    ok(await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: [] }, linker))
    expect(await scopes()).toEqual({ orders: 2, support: 1 })
    expect((await keyOf()).stores).toEqual(["store_mkt_a"])
  }, 120_000)

  it("installs a connector app through its connection, and lets it go only after the connection", async () => {
    const started = ok(await rpc("Marketplace.install", { appId: "ext_klaviyo" }, owner.cookie))
    expect(started).toMatchObject({ install: null, key: null, connect: "klaviyo" })
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])

    expect((await connectKlaviyo(owner.cookie)).status).toBe(302)
    const klaviyo = ok(await rpc("Marketplace.get", { appId: "ext_klaviyo" }, owner.cookie)).install
    expect(klaviyo).toMatchObject({ appId: "ext_klaviyo", via: "connection" })
    expect(failure(await rpc("Marketplace.uninstall", { appId: "ext_klaviyo" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "connected"
    })
    expect(failure(
      await rpc("Marketplace.setScopes", { appId: "ext_klaviyo", revoked: [] }, owner.cookie)
    )).toMatchObject({ _tag: "Conflict", reason: "not_scoped" })

    ok(await rpc("Marketing.disconnect", undefined, owner.cookie))
    expect(ok(await rpc("Marketplace.uninstall", { appId: "ext_klaviyo" }, owner.cookie)).undo).toBeNull()
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])
  })

  it("installs nothing for a Binnenkort app, and keeps feedback", async () => {
    expect(failure(await rpc("Marketplace.install", { appId: "ext_yotpo" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "soon"
    })
    expect(failure(
      await rpc("Marketplace.feedback", { category: "suggest", message: "  " }, owner.cookie)
    )).toMatchObject({ _tag: "Invalid", fields: { message: "required" } })
    ok(await rpc("Marketplace.feedback", { category: "suggest", message: "Een retourportaal graag." }, owner.cookie))
  })
})

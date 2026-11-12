import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * The Marketplace on the server (step 20.3, M17 step 3). The catalogue is the code's. A recipe app (Zapier) gets an API
 * key of its own, shown once, narrowed when scopes are taken back (with Undo) and revoked with the app (Undo puts both
 * back). A connector app (Klaviyo) is installed when its connection is: the install names the connect flow, and the
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
    expect(catalog.apps.find((a) => a.id === "ext_zapier")?.install).toEqual({ kind: "key" })
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
    expect(made.install).toMatchObject({ appId: "ext_zapier", via: "app", revokedScopes: [], lastOpenedAt: null })
    const [key] = ok(await rpc("ApiKeys.list", undefined, owner.cookie))
    expect(key).toMatchObject({ label: "Zapier", status: "active", prefix: made.key?.prefix })
    expect(key?.access).toMatchObject({ kind: "custom", scopes: { orders: 2, team: 1 } })
    expect(failure(await rpc("Marketplace.install", { appId: "ext_zapier" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "installed"
    })

    // Writing taken back: the key reads only.
    const scoped = ok(
      await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: ["data.write"] }, owner.cookie)
    )
    expect(scoped.install.revokedScopes).toEqual(["data.write"])
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie))[0]?.access).toMatchObject({
      scopes: { orders: 1, team: 1 }
    })
    ok(await rpc("Shared.undo", { token: scoped.undo.token }, owner.cookie))
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie))[0]?.access).toMatchObject({ scopes: { orders: 2 } })
    expect(failure(
      await rpc("Marketplace.setScopes", { appId: "ext_zapier", revoked: ["iets"] }, owner.cookie)
    )).toMatchObject({ _tag: "Invalid" })

    const opened = ok(await rpc("Marketplace.open", { appId: "ext_zapier" }, owner.cookie))
    expect(opened.lastOpenedAt).not.toBeNull()

    const gone = ok(await rpc("Marketplace.uninstall", { appId: "ext_zapier" }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie))).toEqual([])
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie))[0]?.status).toBe("revoked")
    ok(await rpc("Shared.undo", { token: gone.undo!.token }, owner.cookie))
    expect(ok(await rpc("Marketplace.installs", undefined, owner.cookie)).map((i) => i.appId)).toEqual(["ext_zapier"])
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie))[0]?.status).toBe("active")
  })

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

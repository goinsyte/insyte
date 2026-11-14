import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Koppelingen (`Connections.list`, widgets/05 §5.1), against the recorded twins: every external account the workspace
 * has, read only, with its status, name and last sync. A store's row carries its sync health; a reader held to some
 * stores sees only theirs; and nothing the providers handed over (tokens, the sealed credentials, scopes) leaves.
 */

// A loose read of an answer.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

/** Every key in an answer, at any depth. */
const keysOf = (value: Json): Array<string> =>
  Array.isArray(value)
    ? value.flatMap(keysOf)
    : value !== null && typeof value === "object"
    ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)])
    : []

const ROW_KEYS = ["account", "id", "lastSyncedAt", "note", "provider", "reason", "status", "storeId"]

const connect = async (cookie: string, provider: "klaviyo" | "slack") => {
  const { authorizeUrl } = ok(
    provider === "klaviyo"
      ? await rpc("Marketing.beginConnect", { returnPath: "/settings/integrations" }, cookie)
      : await rpc("Notifications.beginSlackConnect", { returnPath: "/settings/integrations" }, cookie)
  )
  const state = new URL(authorizeUrl).searchParams.get("state")!
  const back = await call(
    `http://api.test/api/connect/${provider}/callback?${new URLSearchParams({ code: "abc", state })}`,
    {
      headers: { cookie },
      redirect: "manual"
    }
  )
  expect(back.status).toBe(302)
}

describe("Koppelingen", () => {
  it("lists every account with its status, the stores with their sync health, and never a credential", async () => {
    const store = await importedStore("con-list")
    let list = ok(await rpc("Connections.list", undefined, store.cookie)).connections
    expect(list.map((c) => [c.provider, c.status])).toEqual([
      ["shopify", "connected"],
      ["forward", "disconnected"],
      ["resend", "disconnected"],
      ["klaviyo", "disconnected"],
      ["slack", "disconnected"],
      // The worker tests run Insyte AI on its fake: switched on.
      ["anthropic", "connected"]
    ])
    expect(list[0]).toMatchObject({
      id: store.storeId,
      storeId: store.storeId,
      account: expect.any(String),
      reason: null,
      note: null,
      lastSyncedAt: expect.any(Number)
    })

    await connect(store.cookie, "klaviyo")
    await connect(store.cookie, "slack")
    ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: `con-${run}@winkel-bv.nl`, label: "Support" },
        store.cookie
      )
    )
    list = ok(await rpc("Connections.list", undefined, store.cookie)).connections
    expect(list.find((c) => c.provider === "klaviyo")).toMatchObject({
      status: "connected",
      account: "Insyte MVP Test"
    })
    expect(list.find((c) => c.provider === "slack")).toMatchObject({ status: "connected", account: "Insyte Test" })
    expect(list.find((c) => c.provider === "forward")).toMatchObject({
      status: "connected",
      account: `con-${run}@winkel-bv.nl`,
      id: expect.stringMatching(/^mbx_/)
    })

    // Shopify, Klaviyo and Slack each left sealed tokens behind; none of it, nor a scope, is in the answer.
    const raw = JSON.stringify(list)
    expect(raw).not.toMatch(/recorded-|sealed|token|secret|scope|read_orders|kid/i)
    for (const row of list) expect(Object.keys(row).toSorted()).toEqual(ROW_KEYS)
    expect(keysOf(list).filter((k) => !ROW_KEYS.includes(k))).toEqual([])
  })

  it("says what a store's sync needs, in the module's words", async () => {
    const store = await importedStore("con-health")
    const staged = await call(
      `http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: { scopes: ["read_orders", "write_products"] } })
      }
    )
    expect(staged.status).toBe(200)
    const [shop] = ok(await rpc("Connections.list", undefined, store.cookie)).connections
    expect(shop).toMatchObject({
      provider: "shopify",
      status: "action_required",
      reason: "scope_missing",
      note: expect.stringContaining("niet meer lezen")
    })
  })

  it("shows a reader held to one store that store only, and is closed to a role without Koppelingen", async () => {
    const store = await importedStore("con-fence")
    const other = await anotherStore(store, "con-fence-2")
    expect(
      ok(await rpc("Connections.list", undefined, store.cookie)).connections.filter((c) => c.provider === "shopify")
        .map((c) => c.storeId)
    ).toEqual([store.storeId, other.storeId])

    // Alleen bekijken (Koppelingen · Bekijken) held to the second store; Klantenservice, who may not see Koppelingen.
    const made = ok(await rpc("Roles.create", { label: "Een winkel", from: "view" }, store.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: role.levels,
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: [other.storeId]
      }, store.cookie)
    )
    const fencedEmail = `con-${run}-fenced@invited.test`
    const serviceEmail = `con-${run}-service@invited.test`
    ok(
      await rpc("Invitations.send", {
        rows: [{ email: fencedEmail, roleId: role.id, stores: "all" }, {
          email: serviceEmail,
          roleId: "service",
          stores: "all"
        }]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const fenced = await join(fencedEmail)
    const service = await join(serviceEmail)
    expect(ok(await sessionMe(fenced)).principals[0]!.workspaceId).toBe(store.workspace)

    const seen = ok(await rpc("Connections.list", undefined, fenced)).connections
    expect(seen.filter((c) => c.provider === "shopify").map((c) => c.storeId)).toEqual([other.storeId])
    expect(JSON.stringify(seen)).not.toContain(store.storeId)
    expect(failure(await rpc("Connections.list", undefined, service))).toMatchObject({ _tag: "Forbidden" })
  })
})

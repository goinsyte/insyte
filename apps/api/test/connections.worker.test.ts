import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Koppelingen (`Connections.list`, widgets/05 §5.1), against the recorded twins: every external account the workspace
 * has, read only, with its status, name and last sync. A store's row carries its sync health; a reader held to some
 * stores sees only theirs, and one who reaches none is offered no store to connect; the sending domain reads as
 * Resend last had it; and nothing the providers handed over (tokens, the sealed credentials, scopes) leaves.
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

/** The codes a row may give as its reason: an incident kind, or what the page says needs doing. */
const REASONS = [
  null,
  "action_required",
  "webhook_gap",
  "token_expiring",
  "token_expired",
  "scope_missing",
  "rate_limited",
  "sync_failed",
  "unverified",
  "off"
]

/**
 * Only the row's own fields, and nothing a provider handed over: no token, sealed value, secret or scope. The reason is
 * a code from a fixed list (one of them names scopes, so the rest of the row is what the text check reads).
 */
const expectLeakFree = (list: ReadonlyArray<Json>) => {
  for (const row of list) expect(Object.keys(row).toSorted()).toEqual(ROW_KEYS)
  expect(keysOf(list).filter((k) => !ROW_KEYS.includes(k))).toEqual([])
  for (const row of list) expect(REASONS).toContain(row.reason)
  const rest = list.map((row) => ({ ...row, reason: null }))
  expect(JSON.stringify(rest)).not.toMatch(/recorded-|sealed|token|secret|scope|read_|write_|kid/i)
}

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

const list = async (cookie: string) => ok(await rpc("Connections.list", undefined, cookie)).connections

const shopIds = async (cookie: string) =>
  (await list(cookie)).filter((c) => c.provider === "shopify").map((c) => c.storeId)

const email = (tag: string) => `con-${run}-${tag}@invited.test`

const dev = async (path: string) => (await call(`http://api.test/api/__dev/${path}`, { method: "POST" })).json()

describe("Koppelingen", () => {
  it("lists every account with its status, the stores with their sync health, and never a credential", async () => {
    const store = await importedStore("con-list")
    let rows = await list(store.cookie)
    expect(rows.map((c) => [c.provider, c.status])).toEqual([
      ["shopify", "connected"],
      ["forward", "disconnected"],
      ["resend", "disconnected"],
      ["klaviyo", "disconnected"],
      ["slack", "disconnected"],
      // The worker tests run Insyte AI on its fake: switched on.
      ["anthropic", "connected"]
    ])
    expect(rows[0]).toMatchObject({
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
    rows = await list(store.cookie)
    expect(rows.find((c) => c.provider === "klaviyo")).toMatchObject({
      status: "connected",
      account: "Insyte MVP Test"
    })
    expect(rows.find((c) => c.provider === "slack")).toMatchObject({ status: "connected", account: "Insyte Test" })
    expect(rows.find((c) => c.provider === "forward")).toMatchObject({
      status: "connected",
      account: `con-${run}@winkel-bv.nl`,
      id: expect.stringMatching(/^mbx_/)
    })
    // Shopify, Klaviyo and Slack each left sealed tokens behind; none of it, nor a scope, is in the answer.
    expectLeakFree(rows)
  })

  it("says what a store's sync needs, in the module's words, and a warning beside Gekoppeld", async () => {
    const store = await importedStore("con-health")
    const stage = (body: Record<string, unknown>) =>
      call(`http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })

    // The grant lapses in three days: Insyte warns, and the store still reads as connected.
    expect((await stage({ stage: { refreshExpiresInDays: 3 } })).status).toBe(200)
    let [shop] = await list(store.cookie)
    expect(shop).toMatchObject({
      status: "connected",
      reason: "token_expiring",
      note: expect.stringContaining("verloopt over")
    })

    // The sync's scopes missing too: action needed, and the sentence that says which.
    expect((await stage({ stage: { refreshExpiresInDays: 3, scopes: ["read_orders", "write_products"] } })).status)
      .toBe(200)
    const rows = await list(store.cookie)
    ;[shop] = rows
    expect(shop).toMatchObject({
      provider: "shopify",
      status: "action_required",
      reason: "scope_missing",
      note: expect.stringContaining("niet meer lezen")
    })
    // The answer that names an incident is as clean as any: the code is the reason, never a scope Shopify granted.
    expectLeakFree(rows)
  })

  it("reads the sending domain as Resend last had it, not as it once was", async () => {
    const store = await importedStore("con-domain")
    const domain = `con-${run}.nl`
    ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: `support@${domain}`, label: "Domein" },
        store.cookie
      )
    )
    ok(await rpc("SendingDomain.setUp", { name: domain }, store.cookie))
    expect((await list(store.cookie)).find((c) => c.provider === "resend")).toMatchObject({
      status: "action_required",
      reason: "unverified",
      account: domain
    })

    ok(await rpc("SendingDomain.verify", undefined, store.cookie))
    expect(ok(await rpc("SendingDomain.verify", undefined, store.cookie))).toMatchObject({ verified: true })
    const version = ok(await rpc("SendingDomain.get", undefined, store.cookie)).version
    ok(
      await rpc(
        "SendingDomain.saveSenders",
        { from: `service@${domain}`, replyTo: "", baseVersion: version },
        store.cookie
      )
    )
    expect((await list(store.cookie)).find((c) => c.provider === "resend")).toMatchObject({
      status: "connected",
      reason: null
    })

    // Resend refuses the brand's address: the domain is marked not verified, though it was verified once.
    await dev(`mail/refuse-sender?domain=${domain}`)
    ok(await rpc("Threads.compose", { to: `koper-${run}@voorbeeld.nl`, subject: "Hoi", body: "Even." }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await dev(`mail/refuse-sender?domain=${domain}&off=1`)
    expect((await list(store.cookie)).find((c) => c.provider === "resend")).toMatchObject({
      status: "action_required",
      reason: "unverified"
    })
  })

  it("shows a reader held to some stores those only, by their own stores as well as their role's", async () => {
    const store = await importedStore("con-fence")
    const other = await anotherStore(store, "con-fence-2")
    expect(await shopIds(store.cookie)).toEqual([store.storeId, other.storeId])

    // A role held to the second store; Alleen bekijken (every store) with the member held to the second store; a role
    // held to a store the workspace does not have; and Klantenservice, who may not see Koppelingen.
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
    const elsewhere = ok(await rpc("Roles.create", { label: "Geen winkel", from: "view" }, store.cookie))
    const none = elsewhere.roles.roles.find((r) => r.id === elsewhere.id)!
    ok(
      await rpc("Roles.update", {
        id: none.id,
        levels: none.levels,
        specials: none.specials,
        refundLimit: none.refundLimit,
        stores: ["sto_elsewhere"]
      }, store.cookie)
    )
    ok(
      await rpc("Invitations.send", {
        rows: [
          { email: email("role"), roleId: role.id, stores: "all" },
          { email: email("member"), roleId: "view", stores: [other.storeId] },
          { email: email("none"), roleId: none.id, stores: "all" },
          { email: email("service"), roleId: "service", stores: "all" }
        ]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const byRole = await join(email("role"))
    const byMember = await join(email("member"))
    const byNone = await join(email("none"))
    const service = await join(email("service"))
    expect(ok(await sessionMe(byMember)).principals[0]!.workspaceId).toBe(store.workspace)

    for (const cookie of [byRole, byMember]) {
      expect(await shopIds(cookie)).toEqual([other.storeId])
      expect(JSON.stringify(await list(cookie))).not.toContain(store.storeId)
    }
    // Reaching none of the workspace's stores, no Shopify row at all: not a store to connect.
    const seen = await list(byNone)
    expect(seen.filter((c) => c.provider === "shopify")).toEqual([])
    expect(JSON.stringify(seen)).not.toMatch(new RegExp(`${store.storeId}|${other.storeId}`))
    expect(seen.map((c) => c.provider)).toEqual(["forward", "resend", "klaviyo", "slack", "anthropic"])
    expect(failure(await rpc("Connections.list", undefined, service))).toMatchObject({ _tag: "Forbidden" })
  })
})

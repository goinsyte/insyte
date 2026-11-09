import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Klaviyo (step 9.5, M7.5), against its recorded twin. The owner connects an account by OAuth with PKCE: Klaviyo's way
 * back is checked against the state the flow kept. Its lists are read; a dry run only counts; a sync sends only who said
 * yes to marketing, after the undo window (Undo inside it stops it), into a list Klaviyo has or one it makes; the
 * profile then shows the list. Disconnecting lets the account go.
 */

const connectKlaviyo = async (cookie: string) => {
  const { authorizeUrl } = ok(await rpc("Marketing.beginConnect", { returnPath: "/customers" }, cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  expect(new URL(authorizeUrl).searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return call(`http://api.test/api/connect/klaviyo/callback?${new URLSearchParams({ code: "abc", state })}`, {
    headers: { cookie },
    redirect: "manual"
  })
}

const customerNamed = async (cookie: string, name: string) =>
  ok(await rpc("Customers.list", { limit: 50 }, cookie)).rows.find((c) => c.name === name)!

describe("Klaviyo", () => {
  it("connects by OAuth, sends only those who said yes, after the window, and shows the list on the profile", async () => {
    const store = await importedStore("mkt-sync")
    expect(ok(await rpc("Marketing.status", undefined, store.cookie))).toEqual({ configured: true, account: null })
    const ids = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows.map((c) => c.id)
    const input = { ids, listId: "LIST_VIP", listName: "VIP", withTags: true, dryRun: false }
    expect(failure(await rpc("Customers.syncToMarketing", input, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "not_connected"
    })

    const back = await connectKlaviyo(store.cookie)
    expect(back.status).toBe(302)
    expect(back.headers.get("location")).toBe("/customers?connected=klaviyo")
    expect(ok(await rpc("Marketing.status", undefined, store.cookie)).account).toBe("Insyte MVP Test")
    // The state is spent: Klaviyo's way back cannot be replayed.
    const replay = await call(
      `http://api.test/api/connect/klaviyo/callback?${new URLSearchParams({ code: "abc", state: "used" })}`,
      { headers: { cookie: store.cookie }, redirect: "manual" }
    )
    expect(replay.headers.get("location")).toBe("/customers?error=klaviyo_state")

    expect(ok(await rpc("Customers.marketingLists", undefined, store.cookie)).map((l) => l.name)).toEqual([
      "Nieuwsbrief",
      "VIP"
    ])

    // Anna said yes at the checkout; Bram and Chen did not.
    expect(ok(await rpc("Customers.syncToMarketing", { ...input, dryRun: true }, store.cookie))).toMatchObject({
      syncId: null,
      sendable: 1,
      skipped: { consent: 2, email: 0 },
      undo: null
    })

    await using syncs = await introspectWorkflow(env.MARKETING_SYNC)
    const asked = ok(await rpc("Customers.syncToMarketing", input, store.cookie))
    expect(asked).toMatchObject({ sendable: 1, skipped: { consent: 2, email: 0 } })
    expect(asked.undo?.token).toMatch(/^und_/)
    await relay(store.workspace)
    expect(await syncs.get()).toHaveLength(0)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await syncs.get()
    await instance!.waitForStatus("complete")
    expect(await instance!.getOutput()).toMatchObject({ syncId: asked.syncId, outcome: "sent", sent: 1 })

    const anna = await customerNamed(store.cookie, "Anna de Vries")
    expect(ok(await rpc("Customers.get", { id: anna.id }, store.cookie)).klaviyo?.list).toBe("VIP")
  })

  it("stops a sync inside the window, makes a new list by name, and lets the account go", async () => {
    const store = await importedStore("mkt-undo")
    expect((await connectKlaviyo(store.cookie)).status).toBe(302)
    const anna = await customerNamed(store.cookie, "Anna de Vries")
    await using syncs = await introspectWorkflow(env.MARKETING_SYNC)

    const stopped = ok(
      await rpc("Customers.syncToMarketing", {
        ids: [anna.id],
        listId: "LIST_NEWS",
        listName: "Nieuwsbrief",
        withTags: false,
        dryRun: false
      }, store.cookie)
    )
    ok(await rpc("Shared.undo", { token: stopped.undo!.token }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await syncs.get()).toHaveLength(0)

    ok(
      await rpc("Customers.syncToMarketing", {
        ids: [anna.id],
        listId: null,
        listName: "Terugwinnen",
        withTags: true,
        dryRun: false
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [made] = await syncs.get()
    await made!.waitForStatus("complete")
    expect(await made!.getOutput()).toMatchObject({ outcome: "sent", sent: 1 })
    expect(ok(await rpc("Customers.get", { id: anna.id }, store.cookie)).klaviyo?.list).toBe("Terugwinnen")

    ok(await rpc("Marketing.disconnect", undefined, store.cookie))
    expect(ok(await rpc("Marketing.status", undefined, store.cookie)).account).toBeNull()
    expect(failure(await rpc("Customers.marketingLists", undefined, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "not_connected"
    })
  })

  it("counts a sync with nobody to send as nothing sent", async () => {
    const store = await importedStore("mkt-none")
    expect((await connectKlaviyo(store.cookie)).status).toBe(302)
    const bram = await customerNamed(store.cookie, "Bram Jansen")
    const result = ok(
      await rpc("Customers.syncToMarketing", {
        ids: [bram.id],
        listId: "LIST_VIP",
        listName: "VIP",
        withTags: true,
        dryRun: false
      }, store.cookie)
    )
    expect(result).toEqual(expect.objectContaining({ syncId: null, sendable: 0, undo: null }))
  })
})

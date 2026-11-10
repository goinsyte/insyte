import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Start's queue (step 12.1, M10.1), against Shopify's recorded twin. Rows come from the records: a return waiting for
 * review opens one and approving it resolves it; a sold-out variant opens one on the sweep; a store without its link
 * opens one that only roles at Instellingen see. Seen leaves "Wacht op jou" and comes back with Undo.
 */

const refresh = (workspace: string) =>
  call(`http://api.test/api/__dev/queue/refresh?workspace=${workspace}`, { method: "POST" })

const undo = async (cookie: string, token: string | undefined) =>
  ok(await rpc("Shared.undo", { token: token! }, cookie))

describe("Start's queue", () => {
  it("opens a row for a return in review, sees it with Undo, and resolves it when approved", async () => {
    const store = await importedStore("q-life")
    expect(ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows).toEqual([])

    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const started = ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "too_small",
        requested: "refund"
      }, store.cookie)
    ).returns[0]!
    await relay(store.workspace)

    const all = ok(await rpc("Queue.list", { tab: "all" }, store.cookie))
    const row = all.rows.find((r) => r.subjectId === started.id)!
    // Due in 48 hours: on schedule, so not yet "Wacht op jou".
    expect(row).toMatchObject({
      kind: "return_review",
      signal: "green",
      title: `Retour ${started.number} wacht op beoordeling · Klant 1`,
      valueMinor: line.unitPriceMinor,
      state: "open",
      storeName: expect.any(String)
    })
    expect(all.counts).toMatchObject({ needsYou: 0, all: 1 })

    const seen = ok(await rpc("Queue.markSeen", { id: row.id }, store.cookie))
    expect(seen.row.state).toBe("seen")
    expect(failure(await rpc("Queue.markSeen", { id: row.id }, store.cookie))).toMatchObject({
      _tag: "QueueItemClosed"
    })
    await undo(store.cookie, seen.undo?.token)
    expect(ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows[0]!.state).toBe("open")

    ok(await rpc("Returns.approve", { ids: [started.id] }, store.cookie))
    await relay(store.workspace)
    expect(ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows).toEqual([])
  })

  it("puts a sold-out variant in front of the team on the sweep, and a lost store only in front of who may fix it", async () => {
    const store = await importedStore("q-sweep", "upd")
    const level = await call("http://api.public.test/hooks/shopify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "inventory_levels/update",
        "x-shopify-shop-domain": store.shop,
        "x-shopify-webhook-id": `q-${run}-1`,
        "x-shopify-hmac-sha256": "valid"
      },
      body: JSON.stringify({ inventory_item_id: 11, location_id: 900, available: 0 })
    })
    expect(level.status).toBe(200)
    // The delivery is applied by the queue consumer; the sweep then sees the stock-out.
    let soldOut: Array<{ title: string; signal: string }> = []
    for (let i = 0; i < 50 && soldOut.length === 0; i++) {
      await refresh(store.workspace)
      soldOut = ok(await rpc("Queue.list", { tab: "needs_you" }, store.cookie)).rows.filter((r) =>
        r.kind === "stock_out"
      )
      if (soldOut.length === 0) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(soldOut).toEqual([expect.objectContaining({ title: "Linnen overhemd · M is uitverkocht", signal: "amber" })])

    // Klantenservice holds no Instellingen: a store without its link is not its row.
    const email = `q-service-${run}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const service = await join(email)
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    await relay(store.workspace)
    await refresh(store.workspace)
    const owner = ok(await rpc("Queue.list", { tab: "needs_you" }, store.cookie))
    expect(owner.rows.find((r) => r.kind === "store_disconnected")).toMatchObject({ signal: "red" })
    const theirs = ok(await rpc("Queue.list", { tab: "needs_you" }, service))
    expect(theirs.rows.find((r) => r.kind === "store_disconnected")).toBeUndefined()
    expect(theirs.counts.needsYou).toBe(owner.counts.needsYou - 1)
  })

  it("gives a newcomer without a store an empty queue", async () => {
    const lone = await person("q-lone", "Q Lone B.V.")
    expect(ok(await rpc("Queue.list", {}, lone.cookie))).toEqual({
      rows: [],
      counts: { needsYou: 0, drawn: 0, all: 0 }
    })
  })
})

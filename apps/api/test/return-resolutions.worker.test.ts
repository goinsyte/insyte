import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, mailsAbout, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Step 11.3 (M9.3), against Shopify's recorded twin: a return settled with a gift card, a discount code, an exchange or
 * a replacement is made in Shopify once its undo window has passed (and not at all when Undo came first); a scope the
 * store has not granted is recorded and can be asked again; Shopify's `returns/*` webhooks mirror its own returns, and
 * Insyte's decision on one goes back to Shopify; the shopper hears each step once, in the store's name.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

interface Writes {
  get: () => Promise<Array<{ waitForStatus: (s: "complete") => Promise<void>; getOutput: () => Promise<unknown> }>>
}

/** The Shopify write for this return among the workflows started since introspection began, once it has run. */
const written = async (writes: Writes, id: string, after = 0) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    const found = []
    for (const instance of await writes.get()) {
      await instance.waitForStatus("complete")
      const mine = (await instance.getOutput() as Array<Outcome>).find((o) => o.id === id)
      if (mine !== undefined) found.push(mine)
    }
    if (found.length > after) return found[found.length - 1]!
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`no Shopify write ran for ${id}`)
}

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

/** A return started, approved, received and inspected: ready to settle. */
const ready = async (
  cookie: string,
  number: string,
  options: { reasonId?: string; requested?: "refund" | "exchange" | "replacement"; exchangeTo?: string } = {}
) => {
  const order = await orderNumbered(cookie, number)
  const line = ok(await rpc("Orders.get", { id: order.id }, cookie)).lines[0]!
  const started = ok(
    await rpc("Returns.start", {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: options.reasonId ?? "too_small",
      requested: options.requested ?? "refund",
      ...(options.exchangeTo === undefined ? {} : { exchangeTo: options.exchangeTo })
    }, cookie)
  ).returns[0]!
  const claim = started.kind === "claim"
  ok(await rpc("Returns.approve", { ids: [started.id], ...(claim ? { keepItem: true } : {}) }, cookie))
  if (!claim) {
    ok(await rpc("Returns.markReceived", { id: started.id }, cookie))
    ok(await rpc("Returns.inspect", { id: started.id }, cookie))
  }
  return started
}

const shopifyOf = async (cookie: string, id: string) =>
  ok(await rpc("Returns.get", { id }, cookie)).record.resolution?.shopify

/** Until the return's mails are in (the relay's kicks deliver on their own too). */
const mailed = async (email: string, id: string, n: number) => {
  for (let i = 0; i < 50; i++) {
    const mails = await mailsAbout(email, id)
    if (mails.length >= n) return mails
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return mailsAbout(email, id)
}

let delivery = 0
/** A webhook as Shopify sends it, to the API's public host. */
const hook = (shop: string, topic: string, body: unknown) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `wh-res-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify(body)
  })

/** Until every delivery of the store is applied (the queue consumer runs on its own). */
const applied = async (store: { workspace: string; storeId: string }) => {
  for (let i = 0; i < 100; i++) {
    const mirror = (await (await call(
      `http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`
    )).json()) as { inbound: Array<{ processed: boolean }> }
    if (mirror.inbound.every((e) => e.processed)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the deliveries were not applied")
}

describe("return resolutions in Shopify", () => {
  it("makes a gift card after the window, makes nothing when Undo came first, and mails the shopper", async () => {
    const store = await importedStore("res-gift")
    const r = await ready(store.cookie, "#1002")
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    // Settled in error: Undo takes it back before anything reaches Shopify.
    const mistaken = ok(await rpc("Returns.resolve", { id: r.id, resolution: "gift_card" }, store.cookie))
    expect(mistaken.returns[0]!.resolution?.shopify).toMatchObject({ state: "requested", code: null })
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    expect(ok(await rpc("Returns.get", { id: r.id }, store.cookie)).record).toMatchObject({
      status: "ready",
      resolution: null
    })

    const settled = ok(await rpc("Returns.resolve", { id: r.id, resolution: "gift_card" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    // Past the window it has left: Undo can no longer take it back.
    expect(failure(await rpc("Shared.undo", { token: settled.undo!.token }, store.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    expect(await written(writes, r.id)).toMatchObject({ outcome: "sent" })
    expect(await writes.get()).toHaveLength(1)

    const detail = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(detail.record.resolution).toMatchObject({
      kind: "gift_card",
      amountMinor: Math.round(8900 * 1.1),
      shopify: { state: "done", reason: null, code: expect.stringMatching(/^•••• [A-Z2-9]{4}$/) }
    })
    expect(detail.events.map((e) => e.text)).toContain("Cadeaubon gemaakt in Shopify")

    // Received (started by the team), approved, settled: each once, to the shopper, in the store's name.
    await relay(store.workspace)
    const mails = await mailed("klant1@example.com", r.id, 3)
    expect(mails.map((m) => m.kind).toSorted()).toEqual(["return.approved", "return.received", "return.resolved"])
    expect(new Set(mails.map((m) => m.sender))).toEqual(new Set(["Insyte MVP Test"]))
    expect(detail.events.filter((e) => e.who === "insyte" && e.text.endsWith("gemaild aan de klant")).length)
      .toBeGreaterThanOrEqual(2)
  })

  it("makes a discount code, an exchange order and a replacement order in Shopify", async () => {
    const store = await importedStore("res-kinds")
    const discount = await ready(store.cookie, "#1002")
    const exchange = await ready(store.cookie, "#1003", { requested: "exchange", exchangeTo: "M" })
    const replacement = await ready(store.cookie, "#1001", { reasonId: "damaged", requested: "replacement" })
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Returns.resolve", { id: discount.id, resolution: "discount" }, store.cookie))
    ok(await rpc("Returns.resolve", { id: exchange.id, resolution: "exchange" }, store.cookie))
    ok(await rpc("Returns.resolve", { id: replacement.id, resolution: "replacement" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)

    expect(await written(writes, discount.id)).toMatchObject({ outcome: "sent" })
    expect(await shopifyOf(store.cookie, discount.id)).toMatchObject({
      state: "done",
      code: expect.stringMatching(/^R\d+-[A-Z2-9]{6}$/)
    })
    expect(await written(writes, exchange.id)).toMatchObject({ outcome: "sent" })
    expect(await shopifyOf(store.cookie, exchange.id)).toMatchObject({
      state: "done",
      order: expect.stringMatching(/^#19\d\d$/)
    })
    expect(await written(writes, replacement.id)).toMatchObject({ outcome: "sent" })
    const replaced = ok(await rpc("Returns.get", { id: replacement.id }, store.cookie))
    expect(replaced.record.resolution?.shopify).toMatchObject({ state: "done", order: expect.stringMatching(/^#19/) })
    expect(replaced.events.some((e) => /^Vervangende bestelling gemaakt in Shopify: #19\d\d$/.test(e.text))).toBe(true)

    await relay(store.workspace)
    expect((await mailed("klant2@example.com", exchange.id, 3)).map((m) => m.kind)).toContain("return.resolved")
  })

  it("records a scope the store has not granted, and asks again when told to", async () => {
    const store = await importedStore("res-scope", "noscope")
    const r = await ready(store.cookie, "#1002")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Returns.resolve", { id: r.id, resolution: "gift_card" }, store.cookie))
    // Retrying what has not failed is refused.
    expect(failure(await rpc("Returns.retryResolution", { id: r.id }, store.cookie))).toMatchObject({
      _tag: "IllegalReturnMove"
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes, r.id)).toMatchObject({ outcome: "refused", reason: "write_gift_cards" })
    const failed = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(failed.record.resolution?.shopify).toMatchObject({
      state: "failed",
      scope: "write_gift_cards",
      reason: "Insyte mag nog geen cadeaubonnen maken in deze winkel"
    })
    expect(failed.events.at(-1)?.text).toBe(
      "De cadeaubon kon niet worden gemaakt in Shopify: Insyte mag nog geen cadeaubonnen maken in deze winkel"
    )

    // "Opnieuw proberen": asked again at once, and refused again while the scope is still missing.
    const again = ok(await rpc("Returns.retryResolution", { id: r.id }, store.cookie))
    expect(again.returns[0]!.resolution?.shopify).toMatchObject({ state: "requested", scope: null })
    await relay(store.workspace)
    expect(await written(writes, r.id, 1)).toMatchObject({ outcome: "refused", reason: "write_gift_cards" })
    // Nothing made, nothing said to the shopper about what they get.
    await relay(store.workspace)
    expect((await mailsAbout("klant1@example.com", r.id)).map((m) => m.kind)).not.toContain("return.resolved")
  })
})

/** A `returns/request` payload as Shopify sends it: one line on an order of the recorded store. */
const request = (id: number, order: number, line: number, reason: string) => ({
  id,
  admin_graphql_api_id: `gid://shopify/Return/${id}`,
  status: "requested",
  order: { id: order, admin_graphql_api_id: `gid://shopify/Order/${order}` },
  return_line_items: [{
    fulfillment_line_item: { line_item: { id: line } },
    quantity: 1,
    return_reason: reason,
    customer_note: "Valt klein uit"
  }]
})

describe("Shopify's returns", () => {
  it("mirrors returns/request, approve, decline and close, and says Insyte's decision back to Shopify", async () => {
    const store = await importedStore("res-hooks")
    expect((await hook(store.shop, "returns/request", request(7001, 2, 102, "SIZE_TOO_SMALL"))).status).toBe(200)
    // Delivered again under another id: still the one return.
    await hook(store.shop, "returns/request", request(7001, 2, 102, "SIZE_TOO_SMALL"))
    await hook(store.shop, "returns/request", request(7002, 3, 103, "DEFECTIVE"))
    await hook(store.shop, "returns/request", request(7003, 1, 101, "UNWANTED"))
    await applied(store)

    const rows = ok(await rpc("Returns.list", {}, store.cookie)).rows
    expect(rows).toHaveLength(3)
    const byOrder = (n: string) => rows.find((r) => r.orderNumber === n)!
    expect(byOrder("#1002")).toMatchObject({
      source: "shopify",
      status: "review",
      kind: "return",
      reasonId: "too_small",
      note: "Valt klein uit",
      requested: "refund"
    })
    expect(byOrder("#1003")).toMatchObject({ kind: "claim", reasonId: "damaged" })

    // Declined, approved and closed in Shopify: the returns move with it.
    await hook(store.shop, "returns/decline", { id: 7002, status: "declined", decline: { note: "Buiten de termijn" } })
    await hook(store.shop, "returns/approve", { id: 7003, status: "open" })
    await applied(store)
    await hook(store.shop, "returns/close", { id: 7003, status: "closed" })
    await applied(store)
    const declined = ok(await rpc("Returns.get", { id: byOrder("#1003").id }, store.cookie)).record
    expect(declined).toMatchObject({ status: "rejected", rejectReason: "Buiten de termijn" })
    const closed = ok(await rpc("Returns.get", { id: byOrder("#1001").id }, store.cookie))
    expect(closed.record).toMatchObject({ status: "resolved", resolution: { kind: "refund", by: "Shopify" } })
    expect(closed.events.map((e) => e.text)).toEqual([
      "Retour aangevraagd in Shopify",
      "Goedgekeurd in Shopify",
      "Afgesloten in Shopify"
    ])

    // Approved in Insyte: Shopify hears it once the window has passed, and its echo changes nothing.
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const own = byOrder("#1002")
    ok(await rpc("Returns.approve", { ids: [own.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes, own.id)).toMatchObject({ outcome: "sent" })
    await hook(store.shop, "returns/approve", { id: 7001, status: "open" })
    await applied(store)
    const approved = ok(await rpc("Returns.get", { id: own.id }, store.cookie))
    expect(approved.record.status).toBe("awaiting_parcel")
    expect(approved.events.filter((e) => e.text.startsWith("Goedgekeurd"))).toHaveLength(1)

    // Shopify mailed the request itself; Insyte mails what it decided.
    await relay(store.workspace)
    expect((await mailed("klant1@example.com", own.id, 1)).map((m) => m.kind)).toEqual(["return.approved"])
  })

  it("says a missing scope on a Shopify return's decision in its history", async () => {
    const store = await importedStore("res-hscope", "noscope")
    await hook(store.shop, "returns/request", {
      id: 7101,
      order: { id: 2 },
      return_line_items: [{ line_item: { id: 102 }, quantity: 1, return_reason: "COLOR" }]
    })
    await applied(store)
    const [own] = ok(await rpc("Returns.list", {}, store.cookie)).rows
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Returns.reject", { ids: [own!.id], reason: "Gedragen of gewassen" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes, own!.id)).toMatchObject({ outcome: "refused", reason: "write_returns" })
    const detail = ok(await rpc("Returns.get", { id: own!.id }, store.cookie))
    expect(detail.events.map((e) => e.text)).toContain(
      "Shopify nam de afwijzing niet over: Insyte mag nog geen retouren afhandelen in deze winkel"
    )
    // The shopper still has the reason.
    expect((await mailed("klant1@example.com", own!.id, 1)).map((m) => m.kind)).toEqual(["return.rejected"])
  })
})

describe("the shopper's mails", () => {
  it("mails a rejection once, and a label with its PDF, each once per return", async () => {
    const store = await importedStore("res-mails")
    const order = await orderNumbered(store.cookie, "#1002")
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const r = ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "too_big",
        requested: "refund"
      }, store.cookie)
    ).returns[0]!
    // Rejected in error and taken back: the shopper never hears of it.
    const mistaken = ok(await rpc("Returns.reject", { ids: [r.id], reason: "Buiten de termijn" }, store.cookie))
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    ok(await rpc("Returns.reject", { ids: [r.id], reason: "Gedragen of gewassen" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    // Reopened and rejected again: the rejection was mailed already.
    ok(await rpc("Returns.reopen", { id: r.id }, store.cookie))
    ok(await rpc("Returns.reject", { ids: [r.id], reason: "Gedragen of gewassen" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await mailed("klant1@example.com", r.id, 2)).map((m) => m.kind).toSorted()).toEqual([
      "return.received",
      "return.rejected"
    ])

    // A label: made after its window, then mailed with the PDF.
    ok(await rpc("Returns.reopen", { id: r.id }, store.cookie))
    ok(await rpc("Returns.approve", { ids: [r.id] }, store.cookie))
    const settings = ok(await rpc("Returns.settings", undefined, store.cookie))
    ok(
      await rpc("Returns.setSettings", {
        ...settings,
        addresses: [{
          country: "NL",
          label: "Nederland",
          address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam",
          carrier: "PostNL",
          name: "Northwind Retouren",
          line1: "Distributieweg 12",
          postcode: "3045 AB",
          city: "Rotterdam"
        }]
      }, store.cookie)
    )
    await using labels = await introspectWorkflow(env.RETURN_LABEL)
    ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await labels.get()
    await instance!.waitForStatus("complete")
    await relay(store.workspace)
    const mails = await mailed("klant1@example.com", r.id, 4)
    expect(mails.map((m) => m.kind).toSorted()).toEqual([
      "return.approved",
      "return.label",
      "return.received",
      "return.rejected"
    ])
    const detail = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(detail.events.map((e) => e.text)).toContain("Retourlabel gemaild aan de klant")
  })
})

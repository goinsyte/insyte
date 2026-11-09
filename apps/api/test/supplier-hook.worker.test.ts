import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { ok, outboxOf, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * A supplier's own API talking back (step 10.3, M8.3): `POST /hooks/supplier/:id`, signed with the secret Insyte gave it.
 * An unknown supplier, a bad or stale signature and an unreadable body are refused. Accepting confirms the leg and puts
 * the order at its supplier; a stock problem puts the leg in error in the supplier's words; a new date past its
 * deadline makes the order late; a parcel goes to Shopify with only that supplier's lines and the tracking; stock is
 * kept per SKU.
 */

const encoder = new TextEncoder()

const sign = async (secret: string, body: string, t = Math.floor(Date.now() / 1000)) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${body}`))
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

const hook = async (supplierId: string, body: unknown, signature: string | ((text: string) => Promise<string>)) => {
  const text = typeof body === "string" ? body : JSON.stringify(body)
  const response = await call(`http://api.public.test/hooks/supplier/${supplierId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "insyte-signature": typeof signature === "string" ? signature : await signature(text)
    },
    body: text
  })
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

describe("a supplier's own API", () => {
  it("is heard only when signed, and accepts, reports problems, ships and reports stock", async () => {
    const store = await importedStore("sup-hook")
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const { secret } = ok(
      await rpc("Suppliers.connectApi", {
        id: atelier.id,
        url: "https://echo.supplier.example/orders"
      }, store.cookie)
    )
    const signed = (text: string) => sign(Redacted.value(secret), text)
    ok(await rpc("Suppliers.update", { id: atelier.id, forwardChannel: "api" }, store.cookie))

    // #1001 goes to Atelier Noord by its API.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [send] = await sends.get()
    await send!.waitForStatus("complete")
    const state = async () => ok(await rpc("Forwarding.forOrder", { orderId: leg.orderId }, store.cookie))[0]!

    // Refused before anything is read.
    expect((await hook("sup_none", { type: "order.accepted", leg_id: leg.id }, signed)).status).toBe(404)
    expect((await hook(atelier.id, { type: "order.accepted", leg_id: leg.id }, "t=1,v1=00")).status).toBe(401)
    const stale = (text: string) => sign(Redacted.value(secret), text, Math.floor(Date.now() / 1000) - 600)
    expect(await hook(atelier.id, { type: "order.accepted", leg_id: leg.id }, stale)).toMatchObject({
      status: 401,
      body: { error: "bad_signature" }
    })
    expect(await hook(atelier.id, "{\"type\":\"order.dance\"}", signed)).toMatchObject({
      status: 422,
      body: { error: "unreadable_event" }
    })
    expect(await hook(atelier.id, { type: "order.accepted", leg_id: "fwd_none" }, signed)).toMatchObject({
      status: 404,
      body: { error: "unknown_leg" }
    })

    // Accepted: confirmed, and #1001 is at its supplier.
    expect((await hook(atelier.id, { type: "order.accepted", leg_id: leg.id }, signed)).status).toBe(200)
    expect((await state()).state).toBe("confirmed")
    expect(ok(await rpc("Orders.get", { id: leg.orderId }, store.cookie)).order.status).toBe("at_supplier")

    // A new date already behind us: the order counts as late for the supplier.
    expect(
      (await hook(atelier.id, {
        type: "order.problem",
        leg_id: leg.id,
        kind: "delay",
        note: "Stof komt later binnen",
        new_date: "2026-01-02"
      }, signed)).status
    ).toBe(200)
    expect((await state()).state).toBe("confirmed")
    const late = ok(await rpc("Suppliers.get", { id: atelier.id }, store.cookie))
    expect(late.supplier.stats.delayed).toBe(1)
    expect(late.delayedOrders.map((o) => o.number)).toEqual([])

    // Out of stock: the leg waits for the operator, in the supplier's words.
    expect(
      (await hook(atelier.id, {
        type: "order.problem",
        leg_id: leg.id,
        kind: "stock",
        note: "Maat M is op"
      }, signed)).status
    ).toBe(200)
    expect(await state()).toMatchObject({ state: "error", errorKind: "stock", errorNote: "Maat M is op" })

    // Shipped after all: Shopify gets a fulfillment of only Atelier Noord's line, with the tracking.
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    expect(
      (await hook(atelier.id, {
        type: "order.shipped",
        leg_id: leg.id,
        carrier: "PostNL",
        tracking_number: "3SABCD1234567",
        tracking_url: "https://postnl.nl/tracktrace/3SABCD1234567"
      }, signed)).status
    ).toBe(200)
    expect((await state()).state).toBe("confirmed")
    const fulfil = (await outboxOf(store.workspace)).find((e) => e.event === "order.updated")!
    expect(fulfil.payload).toMatchObject({
      change: "fulfil",
      lines: ["101"],
      tracking: { company: "PostNL", number: "3SABCD1234567", url: "https://postnl.nl/tracktrace/3SABCD1234567" }
    })
    await relay(store.workspace)
    const [write] = await writes.get()
    await write!.waitForStatus("complete")
    expect(await write!.getOutput()).toMatchObject([{ outcome: "sent" }])

    // Stock per SKU, for its own products only.
    expect(
      await hook(atelier.id, {
        type: "stock.updated",
        items: [{ sku: "LIN-M", available: 7 }, { sku: "WOL-1", available: 3 }]
      }, signed)
    ).toMatchObject({ status: 200, body: { updated: 1 } })
  })
})

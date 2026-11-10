import { describe, expect, it } from "vitest"
import { failure, ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * A return's parcel on its way back (step 11.4b, M9.2), against AfterShip's recorded twin. "Zelf versturen": the team
 * fills in the carrier and tracking number the shopper sent; Undo takes it back. The sweep registers it with AfterShip;
 * AfterShip's webhook then moves the return to Onderweg and tells its history when it was delivered.
 */

const sweep = (workspace: string) =>
  call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })

const aftership = (returnId: string, tag: string, message: string) =>
  call("http://api.public.test/hooks/aftership", {
    method: "POST",
    headers: { "content-type": "application/json", "aftership-hmac-sha256": "valid" },
    body: JSON.stringify({
      event: "tracking_update",
      msg: {
        id: "as_3SRET1",
        tag,
        checkpoints: [{ checkpoint_time: "2026-11-10T10:00:00Z", message }],
        custom_fields: { insyte_return: returnId }
      }
    })
  })

const waiting = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  const order = page.rows.find((o) => o.number === number)!
  const line = ok(await rpc("Orders.get", { id: order.id }, cookie)).lines[0]!
  const started = ok(
    await rpc("Returns.start", {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: "too_small",
      requested: "refund"
    }, cookie)
  ).returns[0]!
  ok(await rpc("Returns.approve", { ids: [started.id] }, cookie))
  return started
}

describe("return parcels", () => {
  it("takes the shopper's own tracking with Undo, registers it, and follows it to Onderweg", async () => {
    const store = await importedStore("parcel-life")
    const r = await waiting(store.cookie, "#1002")

    const input = { id: r.id, carrier: "PostNL" as const, tracking: "3s ret 1001" }
    const mistaken = ok(await rpc("Returns.addTracking", input, store.cookie))
    expect(mistaken.returns[0]!.label).toMatchObject({ carrier: "PostNL", tracking: "3SRET1001", self: true })
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    const undone = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(undone.record.label).toBeNull()
    expect(undone.events.map((e) => e.text)).not.toContain("Trackingnummer ingevuld: PostNL 3SRET1001")

    ok(await rpc("Returns.addTracking", input, store.cookie))
    expect(ok(await rpc("Returns.get", { id: r.id }, store.cookie)).events.at(-1)!.text)
      .toBe("Trackingnummer ingevuld: PostNL 3SRET1001")
    expect((await sweep(store.workspace)).status).toBe(200)

    expect((await aftership(r.id, "InTransit", "Aangenomen bij het PostNL-punt")).status).toBe(200)
    const moving = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(moving.record.status).toBe("in_transit")
    expect(moving.events.at(-1)).toMatchObject({
      who: "carrier",
      name: "PostNL",
      text: "Pakket aangenomen, onderweg naar het retouradres"
    })
    // The same news twice is told once.
    await aftership(r.id, "InTransit", "Gesorteerd")
    expect(ok(await rpc("Returns.get", { id: r.id }, store.cookie)).events).toHaveLength(moving.events.length)

    await aftership(r.id, "Delivered", "Bezorgd")
    const delivered = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(delivered.events.at(-1)!.text).toBe("Bezorgd op het retouradres")
    // The team still marks it received when it has looked.
    expect(delivered.record.status).toBe("in_transit")
    ok(await rpc("Returns.markReceived", { id: r.id }, store.cookie))
  })

  it("is only for a return waiting for its parcel, and a webhook for no return is ignored", async () => {
    const store = await importedStore("parcel-rules")
    const page = ok(await rpc("Orders.list", { limit: 50 }, store.cookie))
    const order = page.rows.find((o) => o.number === "#1001")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const inReview = ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "too_big",
        requested: "refund"
      }, store.cookie)
    ).returns[0]!
    expect(
      failure(await rpc("Returns.addTracking", { id: inReview.id, carrier: "DHL", tracking: "JVGL1234" }, store.cookie))
    ).toMatchObject({ _tag: "IllegalReturnMove", from: "review" })
    expect((await aftership("ret_nobody", "InTransit", "Onderweg")).status).toBe(200)
  })
})

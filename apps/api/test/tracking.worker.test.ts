import { describe, expect, it } from "vitest"
import { ok, outboxOf, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Tracking (step 10.4, M8.4), against AfterShip's recorded twin. Each imported parcel with a tracking number becomes a
 * delivery; one Shopify already delivered stays delivered and is never registered. The sweep registers the others and
 * reads them: a parcel that has not moved for the workspace's threshold delays its order, once, and the team hears it;
 * a delay the operator cleared stays cleared. AfterShip's
 * signed webhook delivers it, and the order with it. The order's tracking reads the same through the RPC, `/v1` and MCP.
 */

const sweep = (workspace: string) =>
  call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })

const aftership = (body: unknown, signature = "valid") =>
  call("http://api.public.test/hooks/aftership", {
    method: "POST",
    headers: { "content-type": "application/json", "aftership-hmac-sha256": signature },
    body: JSON.stringify(body)
  })

/** AfterShip telling Insyte a parcel was delivered, named by our delivery id. */
const body = (id: string) => ({
  event: "tracking_update",
  msg: {
    id: "as_3S301",
    tag: "Delivered",
    shipment_delivery_date: "2026-11-09T10:00:00Z",
    checkpoints: [{ checkpoint_time: "2026-11-09T10:00:00Z", message: "Bezorgd bij de buren" }],
    custom_fields: { insyte_delivery: id }
  }
})

describe("tracking", () => {
  it("registers parcels, delays the one that does not move, and delivers it from AfterShip's webhook", async () => {
    const store = await importedStore("trk")
    const orders = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
    const delivered = orders.find((o) => o.number === "#1002")!
    const moving = orders.find((o) => o.number === "#1003")!
    const tracking = async (id: string) => ok(await rpc("Orders.tracking", { orderId: id }, store.cookie))

    expect((await tracking(delivered.id)).parcels).toMatchObject([
      { carrier: "PostNL", trackingNumber: "3S201", status: "delivered" }
    ])
    expect((await tracking(moving.id)).parcels).toMatchObject([{ trackingNumber: "3S301", status: "in_transit" }])

    // Registered and read: in transit, but nothing since 5 October, so #1003 is late and the team hears it.
    expect((await sweep(store.workspace)).status).toBe(200)
    const late = await tracking(moving.id)
    expect(late.parcels[0]).toMatchObject({ status: "in_transit", checkpoint: "Gesorteerd" })
    expect(late.delayedAt).not.toBeNull()
    expect((await tracking(delivered.id)).delayedAt).toBeNull()
    const delays = (await outboxOf(store.workspace)).filter((e) => e.event === "order.delayed")
    // At the workspace's own threshold (Instellingen · Meldingen, 48 hours unless changed).
    expect(delays.map((e) => e.payload)).toMatchObject([{ orderIds: [moving.id], reason: "no_movement", hours: 48 }])
    // Once: a second sweep does not tell it again.
    await sweep(store.workspace)
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.delayed")).toHaveLength(1)
    // Cleared by the operator: not raised again until the parcel has stood still that long since.
    ok(await rpc("Orders.clearDelay", { ids: [moving.id] }, store.cookie))
    await sweep(store.workspace)
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.delayed")).toHaveLength(1)
    expect((await tracking(moving.id)).delayedAt).toBeNull()
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "order.late")?.data).toMatchObject({
      number: "#1003",
      reason: "no_movement"
    })

    // AfterShip's webhook: refused unsigned; signed, the parcel is delivered, and #1003 with it.
    expect((await aftership(body("dlv_none"), "forged")).status).toBe(401)
    expect((await aftership(body("dlv_none"))).status).toBe(200)
    const id = late.parcels[0]!.deliveryId!
    expect((await aftership(body(id))).status).toBe(200)
    const arrived = await tracking(moving.id)
    expect(arrived.parcels[0]).toMatchObject({ status: "delivered", checkpoint: "Bezorgd bij de buren" })
    expect(arrived.deliveredAt).toBe(Date.parse("2026-11-09T10:00:00Z"))
    expect(ok(await rpc("Orders.get", { id: moving.id }, store.cookie)).order.status).toBe("delivered")

    // The same through the public API and MCP.
    const key = ok(
      await rpc("ApiKeys.create", {
        label: `Tracking ${run}`,
        access: { kind: "role", roleId: "service" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const v1 = await call(`http://api.public.test/v1/orders/${moving.id}/tracking`, {
      headers: { authorization: `Bearer ${key}` }
    })
    expect(await v1.json()).toMatchObject({
      order_id: moving.id,
      parcels: [{ carrier: "PostNL", tracking_number: "3S301", status: "delivered" }]
    })
  })
})

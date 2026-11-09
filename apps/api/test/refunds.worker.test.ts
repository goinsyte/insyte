import { mintId } from "@insyte/domain/Ids"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Refunds (step 9.2, M7.2), against Shopify's recorded twin. Irreversible: no undo token, and Shopify hears it at
 * once. The refund counts against the balance from the moment it is asked, but the order reads refunded only once
 * Shopify took it; asked again under the same id it is the same refund. The role's limit per order holds whatever the
 * console shows, and money Shopify cannot find to return fails the refund, so it no longer counts.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

describe("refunds", () => {
  it("refunds an order in full once Shopify took it, and a retried request refunds once", async () => {
    const store = await importedStore("rfd-full")
    const order = await orderNumbered(store.cookie, "#1001")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const refundId = mintId("rfd")

    const asked = ok(await rpc("Orders.refund", { id: order.id, refundId, amountMinor: 4995 }, store.cookie))
    expect(asked.refundId).toBe(refundId)
    // Until Shopify took it, the order is as it was; the refund already counts against what is left.
    expect(asked.order.paymentStatus).toBe("paid")
    expect(failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 1 }, store.cookie)))
      .toMatchObject({ _tag: "AlreadyRefunded" })

    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect((await instance!.getOutput() as Array<Outcome>)[0]).toMatchObject({ outcome: "sent" })

    const refunded = ok(await rpc("Orders.get", { id: order.id }, store.cookie))
    expect(refunded.order).toMatchObject({ paymentStatus: "refunded", status: "refunded" })
    expect(refunded.refunds.map((r) => [r.id, r.amountMinor, r.status])).toEqual([[refundId, 4995, "succeeded"]])

    // The same request again: the same refund, nothing sent twice.
    const again = ok(await rpc("Orders.refund", { id: order.id, refundId, amountMinor: 4995 }, store.cookie))
    expect(again.refundId).toBe(refundId)
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(1)
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds).toHaveLength(1)
  })

  it("refunds part of an order, never more than is left, and nothing on an order without money", async () => {
    const store = await importedStore("rfd-part")
    const order = await orderNumbered(store.cookie, "#1002")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 2000 }, store.cookie))
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).order).toMatchObject({
      paymentStatus: "partially_refunded",
      status: "delivered"
    })
    expect(
      failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 7000 }, store.cookie))
    )
      .toMatchObject({ _tag: "RefundOverBalance", balanceMinor: 6900 })

    const refunded = await orderNumbered(store.cookie, "#1004")
    const voided = await orderNumbered(store.cookie, "#1005")
    for (const o of [refunded, voided]) {
      expect(failure(await rpc("Orders.refund", { id: o.id, refundId: mintId("rfd"), amountMinor: 100 }, store.cookie)))
        .toMatchObject({ _tag: "AlreadyRefunded" })
    }
  })

  it("holds the role's limit per order, whatever the console shows", async () => {
    const store = await importedStore("rfd-limit")
    const email = `rfd-service-${run}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const service = await join(email)
    const order = await orderNumbered(service, "#1003")
    expect(failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 15000 }, service)))
      .toMatchObject({ _tag: "RefundOverLimit", limitMinor: 10000 })
    expect(
      ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 4995 }, service)).order.id
    )
      .toBe(order.id)
  })

  it("fails a refund Shopify cannot cover, so it no longer counts against the order", async () => {
    const store = await importedStore("rfd-short", "short")
    const order = await orderNumbered(store.cookie, "#1001")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 4995 }, store.cookie))
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect((await instance!.getOutput() as Array<Outcome>)[0]).toMatchObject({ outcome: "refused" })
    const detail = ok(await rpc("Orders.get", { id: order.id }, store.cookie))
    expect(detail.order.paymentStatus).toBe("paid")
    expect(detail.refunds.map((r) => r.status)).toEqual(["failed"])
    // The balance is whole again: a smaller refund can be asked.
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 1000 }, store.cookie))
  })
})

import { mintId } from "@insyte/domain/Ids"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { latestRate, paidOrder, setRates, USD_EUR } from "./currencies.ts"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Refunds (step 9.2, M7.2), against Shopify's recorded twin. Irreversible: no undo token, and Shopify hears it at
 * once. The refund counts against the balance from the moment it is asked, but the order reads refunded only once
 * Shopify took it; asked again under the same id it is the same refund. The role's limit per order holds whatever the
 * console shows, and money Shopify cannot find to return fails the refund, so it no longer counts. The limit is in the
 * workspace's currency: an order in another is held to it at the latest ECB rate, and refused while there is none.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

/** The write for this order among the workflows started since introspection began, once it has run. */
const ownWrite = async (
  writes: {
    get: () => Promise<Array<{ waitForStatus: (s: "complete") => Promise<void>; getOutput: () => Promise<unknown> }>>
  },
  orderId: string
) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const instance of await writes.get()) {
      await instance.waitForStatus("complete")
      const found = (await instance.getOutput() as Array<Outcome>).find((o) => o.id === orderId)
      if (found !== undefined) return found
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`no write ran for ${orderId}`)
}

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

/** A member of the store's workspace in the service role: € 100 per order. */
const serviceMember = async (store: { cookie: string; workspace: string }, tag: string) => {
  const email = `${tag}-${run}@invited.test`
  ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, store.cookie))
  await pastUndo(store.workspace)
  await relay(store.workspace)
  return await join(email)
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
      .toMatchObject({
        _tag: "RefundOverLimit",
        limitMinor: 10000,
        currency: "EUR",
        roleMinor: 10000,
        roleCurrency: "EUR"
      })
    // In the workspace's own currency the limit is the role's, unconverted.
    expect(ok(await rpc("Orders.get", { id: order.id }, service)).refundLimit).toEqual({
      limitMinor: 10000,
      currency: "EUR",
      roleMinor: 10000,
      roleCurrency: "EUR"
    })
    expect(
      ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 4995 }, service)).order.id
    )
      .toBe(order.id)
  })

  it("holds an order in another currency to the role's limit at the latest ECB rate", async () => {
    await setRates([{ base: "USD", quote: "EUR", rate: USD_EUR, ageDays: 0 }])
    const store = await importedStore("rfd-fx")
    await paidOrder(store, "#USD1", "USD")
    const service = await serviceMember(store, "rfd-fx")
    const order = await orderNumbered(service, "#USD1")
    expect(order.currency).toBe("USD")

    // € 100 into dollars at the latest rate, rounded down: more than $ 100, which the euro limit no longer reads as.
    const limitMinor = Math.floor(10_000 / await latestRate("USD", "EUR") + 1e-6)
    expect(limitMinor).toBeGreaterThan(10_500)
    expect(limitMinor).toBeLessThan(14_000)
    const limit = { limitMinor, currency: "USD", roleMinor: 10000, roleCurrency: "EUR" }
    expect(ok(await rpc("Orders.get", { id: order.id }, service)).refundLimit).toEqual(limit)

    // Over the converted limit: refused, naming it in both currencies.
    expect(
      failure(
        await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: limitMinor + 1 }, service)
      )
    ).toMatchObject({ _tag: "RefundOverLimit", ...limit })
    // Exactly the converted limit is within it, though more than the role's 100 read as dollars.
    const refunded = ok(
      await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: limitMinor }, service)
    )
    expect(refunded.order.id).toBe(order.id)
    const detail = ok(await rpc("Orders.get", { id: order.id }, store.cookie))
    expect(detail.refunds.map((r) => [r.amountMinor, r.currency])).toEqual([[limitMinor, "USD"]])
    // The owner has no limit, in any currency.
    expect(detail.refundLimit).toBeNull()
  })

  it("settles a return in another currency by refund within the role's limit at the ECB rate", async () => {
    await setRates([{ base: "USD", quote: "EUR", rate: USD_EUR, ageDays: 0 }])
    const store = await importedStore("rfd-fx-ret")
    // $ 105: over the role's 100 read as dollars, under € 100 at the rate.
    await paidOrder(store, "#USD2", "USD", 10500)
    const service = await serviceMember(store, "rfd-fx-ret")
    const order = await orderNumbered(service, "#USD2")
    const line = ok(await rpc("Orders.get", { id: order.id }, service)).lines[0]!
    const input = {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: "too_small",
      requested: "refund" as const
    }
    const started = ok(await rpc("Returns.start", input, service)).returns[0]!
    ok(await rpc("Returns.approve", { ids: [started.id] }, service))
    ok(await rpc("Returns.markReceived", { id: started.id }, service))
    ok(await rpc("Returns.inspect", { id: started.id }, service))
    const limitMinor = Math.floor(10_000 / await latestRate("USD", "EUR") + 1e-6)
    expect(ok(await rpc("Returns.get", { id: started.id }, service)).refundLimit).toEqual({
      limitMinor,
      currency: "USD",
      roleMinor: 10000,
      roleCurrency: "EUR"
    })
    const resolved = ok(
      await rpc("Returns.resolve", { id: started.id, resolution: "refund", refundId: mintId("rfd") }, service)
    )
    expect(resolved.returns[0]!.resolution).toMatchObject({ kind: "refund", amountMinor: 10500 })
    const refunds = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds
    expect(refunds.map((r) => [r.amountMinor, r.currency])).toEqual([[10500, "USD"]])
  })

  it("answers a retried refund as it was, though a new day's rate lowered the limit since", async () => {
    // Kronor, which nothing else here converts: € 100 is kr 1.000 at 0,10, kr 500 at 0,20.
    await setRates([{ base: "SEK", quote: "EUR", rate: "0.10", ageDays: 0 }], true)
    const store = await importedStore("rfd-fx-retry")
    await paidOrder(store, "#SEK1", "SEK", 150_000)
    const service = await serviceMember(store, "rfd-fx-retry")
    const order = await orderNumbered(service, "#SEK1")
    const refundId = mintId("rfd")
    ok(await rpc("Orders.refund", { id: order.id, refundId, amountMinor: 100_000 }, service))

    await setRates([{ base: "SEK", quote: "EUR", rate: "0.20", ageDays: 0 }])
    // The same request again: the same refund, not held to today's limit.
    expect(ok(await rpc("Orders.refund", { id: order.id, refundId, amountMinor: 100_000 }, service)).refundId)
      .toBe(refundId)
    // A new one is.
    expect(failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 50_001 }, service)))
      .toMatchObject({ _tag: "RefundOverLimit", limitMinor: 50_000, currency: "SEK" })
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds).toHaveLength(1)
  })

  it("holds no limit with a rate more than a week old, and does with one of a few days", async () => {
    // Kroner, which nothing else here converts: only a rate of ten days ago.
    await setRates([{ base: "NOK", quote: "EUR", rate: "0.08", ageDays: 10 }], true)
    const store = await importedStore("rfd-fx-stale")
    await paidOrder(store, "#NOK1", "NOK")
    const service = await serviceMember(store, "rfd-fx-stale")
    const order = await orderNumbered(service, "#NOK1")
    expect(ok(await rpc("Orders.get", { id: order.id }, service)).refundLimit).toMatchObject({ limitMinor: null })
    expect(failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 100 }, service)))
      .toMatchObject({ _tag: "Conflict", reason: "no_fx_rate" })
    // The owner has no limit to hold.
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 100 }, store.cookie))

    // A rate of three days ago is recent enough: € 100 is kr 1.250 at 0,08.
    await setRates([{ base: "NOK", quote: "EUR", rate: "0.08", ageDays: 3 }])
    expect(ok(await rpc("Orders.get", { id: order.id }, service)).refundLimit).toMatchObject({ limitMinor: 125_000 })
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 100 }, service))
  })

  it("refuses a refund held to a limit while there is no rate for the order's currency", async () => {
    const store = await importedStore("rfd-norate")
    // The ECB quotes no dirham: no rate into the workspace's euro, ever.
    await paidOrder(store, "#AED1", "AED")
    const service = await serviceMember(store, "rfd-norate")
    const order = await orderNumbered(service, "#AED1")
    expect(ok(await rpc("Orders.get", { id: order.id }, service)).refundLimit).toEqual({
      limitMinor: null,
      currency: "AED",
      roleMinor: 10000,
      roleCurrency: "EUR"
    })
    expect(failure(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 100 }, service)))
      .toMatchObject({ _tag: "Conflict", entity: "refund", reason: "no_fx_rate" })
    // Without a limit the rate is not needed: the owner refunds it.
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 100 }, store.cookie))
  })

  it("fails a refund Shopify cannot cover, so it no longer counts against the order", async () => {
    const store = await importedStore("rfd-short", "short")
    const order = await orderNumbered(store.cookie, "#1001")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 4995 }, store.cookie))
    await relay(store.workspace)
    // The previous test's write may start in this window too (the Worker's own delayed kick): this order's is the one.
    const outcome = await ownWrite(writes, order.id)
    expect(outcome).toMatchObject({ outcome: "refused" })
    const detail = ok(await rpc("Orders.get", { id: order.id }, store.cookie))
    expect(detail.order.paymentStatus).toBe("paid")
    expect(detail.refunds.map((r) => r.status)).toEqual(["failed"])
    // The balance is whole again: a smaller refund can be asked.
    ok(await rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 1000 }, store.cookie))
  })

  it("lets two refunds asked at once take what is left once", async () => {
    const store = await importedStore("rfd-race")
    const order = await orderNumbered(store.cookie, "#1001")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    // € 49,95 left: either € 30 fits, both do not. Each request locks the order, then reads its refunds.
    const asked = await Promise.all(
      [0, 1].map(() => rpc("Orders.refund", { id: order.id, refundId: mintId("rfd"), amountMinor: 3000 }, store.cookie))
    )
    expect(asked.map((a) => failure(a)?._tag ?? "ok").toSorted()).toEqual(["RefundOverBalance", "ok"])
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds).toHaveLength(1)
    // The one refund goes to Shopify, within this test.
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
  })
})

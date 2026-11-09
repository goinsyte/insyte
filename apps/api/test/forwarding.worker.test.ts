import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, mailsTo, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Forwarding (step 10.2, M8.2). A paid, open order gets one leg per supplier on import, and nothing is forwarded on its
 * own then. A forward waits out the undo window, then goes by mail or the supplier's API: a refusal or a missing address
 * is `send_failed`, with the reason. Confirming puts the order at its supplier; rerouting and cancelling work on legs
 * not yet sent; each with Undo. A supplier set to forward on payment gets a live order at once.
 */

const legsIn = async (cookie: string, view: "to_forward" | "awaiting" | "forward_error") =>
  ok(await rpc("Forwarding.list", { view }, cookie))

const supplierNamed = async (cookie: string, name: string) =>
  ok(await rpc("Suppliers.list", {}, cookie)).rows.find((r) => r.name === name)!

/** Lets the window pass, relays the forward, and waits for its send to finish. */
const sent = async (workspace: string, sends: Awaited<ReturnType<typeof introspectWorkflow>>, n: number) => {
  await pastUndo(workspace)
  await relay(workspace)
  const instances = await sends.get()
  expect(instances).toHaveLength(n)
  await instances[n - 1]!.waitForStatus("complete")
  return instances[n - 1]!.getOutput() as Promise<{ outcome: string; legs: Array<{ id: string; outcome: string }> }>
}

describe("forwarding", () => {
  it("makes legs on import, forwards with Undo, fails without an address, and sends by mail", async () => {
    const store = await importedStore("fwd-mail")
    // #1001 is paid and unfulfilled: one leg, to Atelier Noord (the linen shirt's vendor). Nothing went on its own.
    const queue = await legsIn(store.cookie, "to_forward")
    expect(queue.rows.map((l) => [l.orderNumber, l.supplier?.name, l.lines.map((x) => x.title)])).toEqual([
      ["#1001", "Atelier Noord", ["Linnen overhemd"]]
    ])
    expect(queue.counts).toEqual({ toForward: 1, awaiting: 0, late: 0, error: 0 })
    const leg = queue.rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)

    const undone = ok(await rpc("Forwarding.forward", { ids: [leg.id], note: "Graag snel" }, store.cookie))
    expect(undone.legs[0]).toMatchObject({ state: "sending", via: "email", operatorNote: "Graag snel" })
    expect(undone.legs[0]!.sendingUntil).toBeGreaterThan(Date.now())
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, store.cookie))
    expect((await legsIn(store.cookie, "to_forward")).rows[0]).toMatchObject({ state: "to_forward" })

    // Made from a vendor name, Atelier Noord has no address yet: the send fails, and says why.
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    expect(await sent(store.workspace, sends, 1)).toMatchObject({ outcome: "sent", legs: [{ outcome: "failed" }] })
    expect((await legsIn(store.cookie, "forward_error")).rows[0]).toMatchObject({
      errorKind: "send_failed",
      errorNote: "Geen e-mailadres voor bestellingen"
    })

    const atelier = await supplierNamed(store.cookie, "Atelier Noord")
    const address = `atelier-${run}@supplier.example`
    ok(await rpc("Suppliers.update", { id: atelier.id, contactEmail: address, forwardEmail: address }, store.cookie))
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    expect(await sent(store.workspace, sends, 2)).toMatchObject({ legs: [{ outcome: "sent" }] })
    expect((await mailsTo(address)).map((m) => m.kind)).toEqual(["supplier.order"])
    const waiting = (await legsIn(store.cookie, "awaiting")).rows[0]!
    expect(waiting).toMatchObject({ state: "awaiting", late: false })
    expect(waiting.confirmBy).toBeGreaterThan(Date.now() + 23 * 3_600_000)

    // Its packing slip went with the mail and is kept on the leg: the order, the line, never the customer's email.
    expect(waiting.slipFileId).toMatch(/^fil_/)
    const slip = await call(`http://api.test/api/files/${waiting.slipFileId}`, { headers: { cookie: store.cookie } })
    expect(slip.status).toBe(200)
    expect(slip.headers.get("content-disposition")).toContain("pakbon-1001.html")
    const page = await slip.text()
    expect(page).toContain("Pakbon · #1001")
    expect(page).toContain("1×</td><td>Linnen overhemd")
    expect(page).not.toContain("klant1@example.com")
    expect((await call(`http://api.test/api/files/${waiting.slipFileId}`)).status).toBe(401)
    expect((await call("http://api.test/api/files/fil_none", { headers: { cookie: store.cookie } })).status).toBe(404)

    // Confirmed: every leg of #1001 is with its supplier, so the order is.
    const confirmed = ok(await rpc("Forwarding.markConfirmed", { ids: [leg.id] }, store.cookie))
    expect(confirmed.legs[0]!.state).toBe("confirmed")
    const order = async () => ok(await rpc("Orders.get", { id: leg.orderId }, store.cookie)).order.status
    expect(await order()).toBe("at_supplier")
    ok(await rpc("Shared.undo", { token: confirmed.undo!.token }, store.cookie))
    expect(await order()).toBe("paid")
  })

  it("forwards by the supplier's API, reroutes a refused leg, and cancels", async () => {
    const store = await importedStore("fwd-api")
    const atelier = await supplierNamed(store.cookie, "Atelier Noord")
    expect(failure(await rpc("Suppliers.connectApi", { id: atelier.id, url: "http://plain.example" }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { url: "https" } })

    // The supplier's endpoint refuses: the leg fails with the supplier's own words.
    const connected = ok(
      await rpc("Suppliers.connectApi", {
        id: atelier.id,
        url: "https://refuse.supplier.example/orders"
      }, store.cookie)
    )
    expect(String(connected.secret)).not.toContain("whsec_")
    expect(ok(await rpc("Suppliers.testConnection", { id: atelier.id }, store.cookie))).toMatchObject({
      ok: false,
      reason: "De leverancier antwoordde 422: unknown sku"
    })
    ok(await rpc("Suppliers.update", { id: atelier.id, forwardChannel: "api" }, store.cookie))
    const leg = (await legsIn(store.cookie, "to_forward")).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await sent(store.workspace, sends, 1)
    expect((await legsIn(store.cookie, "forward_error")).rows[0]).toMatchObject({
      via: "api",
      errorKind: "send_failed",
      errorNote: "De leverancier antwoordde 422: unknown sku"
    })

    // To another supplier: back to forward, there, with where it came from.
    const tassen = ok(
      await rpc("Suppliers.create", {
        name: "Tassen & Co",
        contactEmail: `tassen-${run}@supplier.example`,
        contactPhone: "",
        description: ""
      }, store.cookie)
    ).suppliers[0]!
    const moved = ok(await rpc("Forwarding.reroute", { id: leg.id, toSupplierId: tassen.id }, store.cookie))
    expect(moved.legs[0]).toMatchObject({
      state: "to_forward",
      supplier: { name: "Tassen & Co" },
      fromSupplier: { name: "Atelier Noord" }
    })
    expect(failure(await rpc("Forwarding.reroute", { id: leg.id, toSupplierId: "sup_none" }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    // A working endpoint takes it, and the connection test says how fast.
    ok(await rpc("Suppliers.connectApi", { id: tassen.id, url: "https://echo.supplier.example/orders" }, store.cookie))
    expect(ok(await rpc("Suppliers.testConnection", { id: tassen.id }, store.cookie))).toEqual({
      ok: true,
      ms: 42,
      reason: null
    })
    ok(await rpc("Suppliers.update", { id: tassen.id, forwardChannel: "api" }, store.cookie))
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    expect(await sent(store.workspace, sends, 2)).toMatchObject({ legs: [{ outcome: "sent" }] })
    expect((await legsIn(store.cookie, "awaiting")).rows[0]).toMatchObject({ via: "api", state: "awaiting" })

    // A sent leg cannot be cancelled here; the cancel answers nothing changed.
    expect(ok(await rpc("Forwarding.cancel", { ids: [leg.id] }, store.cookie)).legs).toEqual([])
  })

  it("sends a live order at once to a supplier set to forward on payment", async () => {
    const store = await importedStore("fwd-auto")
    const atelier = await supplierNamed(store.cookie, "Atelier Noord")
    const address = `auto-${run}@supplier.example`
    ok(await rpc("Suppliers.update", { id: atelier.id, autoForward: true, forwardEmail: address }, store.cookie))
    // The import's leg is let go, so the next delivery of #1001 makes a new one, as a new paid order would.
    const imported = (await legsIn(store.cookie, "to_forward")).rows[0]!
    ok(await rpc("Forwarding.cancel", { ids: [imported.id] }, store.cookie))

    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    await call("http://api.public.test/hooks/shopify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "orders/paid",
        "x-shopify-shop-domain": store.shop,
        "x-shopify-webhook-id": `wh-fwd-${run}`,
        "x-shopify-hmac-sha256": "valid"
      },
      body: JSON.stringify({ id: 1 })
    })
    // The delivery is applied by the queue's consumer; its leg is forwarded with no window to wait out.
    for (
      let i = 0;
      i < 100 && (await outboxOf(store.workspace)).every((e) => e.event !== "forwarding.send_requested");
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect((await legsIn(store.cookie, "awaiting")).rows[0]).toMatchObject({ state: "sending", forwardedBy: "system" })
    await relay(store.workspace)
    const [instance] = await sends.get()
    await instance!.waitForStatus("complete")
    const auto = (await legsIn(store.cookie, "awaiting")).rows[0]!
    expect(auto).toMatchObject({ orderNumber: "#1001", state: "awaiting", forwardedBy: "system" })
    expect((await mailsTo(address)).map((m) => m.kind)).toEqual(["supplier.order"])
  })
})

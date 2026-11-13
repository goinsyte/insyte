import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { cookiesOf, failure, mailsTo, ok, ORIGIN, outboxOf, password, pastUndo, post, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The supplier portal (M16 steps 1–2). The brand invites a supplier's person; they sign up through the mail and land in
 * the portal, as that supplier's contact. They see the supplier's own lines of an order with the brand's note for
 * suppliers, never the customer's email or the internal note; they accept, report a problem (the brand's ticket opens
 * once the undo window has passed), ship with tracking (Shopify hears it after the window) and count their stock, each
 * with Undo. An order or a product that is not theirs is not there, and the console's own calls are not theirs.
 */

const supplierNamed = async (cookie: string, name: string) =>
  ok(await rpc("Suppliers.list", {}, cookie)).rows.find((r) => r.name === name)!

describe("the supplier portal", () => {
  it("invites a supplier's person, who works its orders and stock in the portal and nothing else", async () => {
    const store = await importedStore("sup-portal")
    const atelier = await supplierNamed(store.cookie, "Atelier Noord")
    const address = `atelier-${run}@supplier.example`
    ok(await rpc("Suppliers.update", { id: atelier.id, contactEmail: address, forwardEmail: address }, store.cookie))

    // #1001's leg goes to Atelier Noord by mail: its work is open.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [send] = await sends.get()
    await send!.waitForStatus("complete")

    // The brand invites the supplier's person, to orders and stock; they take no seat.
    const person = `noord-${run}@supplier.example`
    expect(
      failure(
        await rpc("Invitations.sendSupplier", {
          rows: [{ supplierId: "sup_none", email: person, scopes: ["stock"] }]
        }, store.cookie)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { "rows.0.supplierId": "unknown" } })
    ok(
      await rpc("Invitations.sendSupplier", {
        rows: [{ supplierId: atelier.id, email: person, name: "Noor", scopes: ["stock"] }]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const mail = (await mailsTo(person))[0]!
    expect(mail.kind).toBe("team.invite")
    const url = new URL(mail.url)
    const ref = { id: url.pathname.split("/").pop()!, k: url.searchParams.get("k")! }
    expect(ok(await rpc("Landing.resolve", ref))).toMatchObject({ state: "new", role: null, supplier: "Atelier Noord" })

    await call("http://api.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", "x-insyte-invitation": `${ref.id}.${ref.k}` },
      body: JSON.stringify({ name: "Noor", email: person, password })
    })
    const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email: person, password }))
    expect(ok(await rpc("Landing.accept", ref, cookie))).toMatchObject({ landing: "/supplier/dashboard" })
    const me = ok(await sessionMe(cookie))
    expect(me.landing).toBe("/supplier/dashboard")
    expect(me.activePrincipal).toMatchObject({ kind: "supplier_contact", partnerName: "Atelier Noord" })

    // Who they are, for which brand; and none of the console's own calls.
    expect(ok(await rpc("SupplierPortal.me", undefined, cookie))).toMatchObject({
      contact: { name: "Noor", role: "owner", scopes: ["orders", "stock"] },
      supplier: { id: atelier.id, name: "Atelier Noord" },
      workspace: { id: store.workspace }
    })
    expect(failure(await rpc("Orders.list", {}, cookie))).toMatchObject({ _tag: "NoWorkspace" })
    expect(failure(await rpc("SupplierPortal.me", undefined, store.cookie))).toMatchObject({
      _tag: "NotSupplierContact"
    })

    // The order, as the supplier sees it: its line, the address without email or phone, no internal note.
    const list = ok(await rpc("SupplierPortal.orders.list", {}, cookie))
    expect(list.rows.map((r) => [r.number, r.status, r.lines.map((l) => l.title)])).toEqual([
      ["#1001", "to_accept", ["Linnen overhemd"]]
    ])
    const order = list.rows[0]!
    const detail = ok(await rpc("SupplierPortal.orders.get", { orderId: order.id }, cookie))
    expect(JSON.stringify(detail)).not.toContain("klant1@example.com")
    expect(detail.shipTo.name).not.toBe("")
    expect(failure(await rpc("SupplierPortal.orders.get", { orderId: "ord_none" }, cookie))).toMatchObject({
      _tag: "NotFound"
    })

    // Accept, with Undo; then accepted for good.
    const accepted = ok(await rpc("SupplierPortal.orders.accept", { orderIds: [order.id, "ord_none"] }, cookie))
    expect(accepted).toMatchObject({ ok: [order.id], skipped: [{ id: "ord_none", reason: "not_found" }] })
    ok(await rpc("SupplierPortal.undo", { token: accepted.undo!.token }, cookie))
    expect(ok(await rpc("SupplierPortal.orders.get", { orderId: order.id }, cookie)).row.status).toBe("to_accept")
    ok(await rpc("SupplierPortal.orders.accept", { orderIds: [order.id] }, cookie))
    expect(ok(await rpc("SupplierPortal.orders.get", { orderId: order.id }, cookie)).row.status).toBe("to_ship")

    // A delay needs its new date; reported, the brand's ticket opens once the window has passed.
    expect(
      failure(
        await rpc("SupplierPortal.orders.reportProblem", { orderId: order.id, kind: "delay", note: "Later" }, cookie)
      )
    ).toMatchObject({ _tag: "Invalid", fields: { newDate: "required" } })
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    ok(
      await rpc("SupplierPortal.orders.reportProblem", {
        orderId: order.id,
        kind: "delay",
        note: "Stof komt later binnen",
        newDate: later
      }, cookie)
    )
    expect(
      failure(
        await rpc("SupplierPortal.orders.reportProblem", { orderId: order.id, kind: "other", note: "Nog een" }, cookie)
      )
    ).toMatchObject({ _tag: "Conflict", reason: "problem_open" })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const tickets = ok(await rpc("Tickets.list", {}, store.cookie))
    expect(JSON.stringify(tickets)).toContain("Vertraging bij #1001 (Atelier Noord)")
    const problem = ok(await rpc("SupplierPortal.orders.get", { orderId: order.id }, cookie))
    expect(problem.problem).toMatchObject({ kind: "delay", newDate: later })

    // Shipped with tracking: the brand's Shopify hears it after the window, with the customer told.
    const shipped = ok(
      await rpc("SupplierPortal.orders.ship", {
        items: [{ orderId: order.id, carrier: "PostNL", tracking: " 3SABC123 " }]
      }, cookie)
    )
    expect(shipped.ok).toEqual([order.id])
    const held = (await outboxOf(store.workspace)).filter((e) => e.event === "order.updated")
    expect(held.at(-1)?.payload).toMatchObject({
      change: "fulfil",
      notify: true,
      supplierId: atelier.id,
      tracking: { company: "PostNL", number: "3SABC123" }
    })
    expect(ok(await rpc("SupplierPortal.orders.get", { orderId: order.id }, cookie))).toMatchObject({
      row: { status: "shipped" },
      parcel: { carrier: "PostNL", tracking: "3SABC123" }
    })
    expect(
      ok(
        await rpc(
          "SupplierPortal.orders.ship",
          { items: [{ orderId: order.id, carrier: "DHL", tracking: "X" }] },
          cookie
        )
      )
        .skipped
    ).toEqual([{ id: order.id, reason: "shipped" }])

    // Stock, by hand, with Undo; a product that is not theirs is not there.
    const products = ok(await rpc("SupplierPortal.products.list", undefined, cookie)).rows
    expect(products.length).toBeGreaterThan(0)
    const product = ok(await rpc("SupplierPortal.products.get", { productId: products[0]!.id }, cookie))
    const variant = product.variants[0]!
    const saved = ok(
      await rpc("SupplierPortal.products.saveStock", {
        productId: product.row.id,
        variantStock: { [variant.id]: 7 },
        leadDays: 4
      }, cookie)
    )
    expect(saved.product.variants.find((v) => v.id === variant.id)).toMatchObject({ available: 7 })
    expect(saved.product.row.leadDays).toBe(4)
    ok(await rpc("SupplierPortal.undo", { token: saved.undo!.token }, cookie))
    expect(ok(await rpc("SupplierPortal.products.get", { productId: product.row.id }, cookie)).row.leadDays).toBe(
      product.row.leadDays
    )
    expect(
      failure(await rpc("SupplierPortal.products.setReporting", { productId: product.row.id, mode: "live" }, cookie))
    ).toMatchObject({ _tag: "Conflict", reason: "live_needs_integration" })
    expect(failure(await rpc("SupplierPortal.products.get", { productId: "prd_none" }, cookie))).toMatchObject({
      _tag: "NotFound"
    })

    // The dashboard counts what is theirs.
    const dashboard = ok(await rpc("SupplierPortal.dashboard", undefined, cookie))
    expect(dashboard.figures.totalOrders).toBe(1)
  }, 180_000)
})

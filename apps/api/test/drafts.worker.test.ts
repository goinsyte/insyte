import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Draft orders and new products (M7.1 "Nieuwe bestelling", M7.3 "Nieuw product"), against Shopify's recorded twin.
 * Each is made in Insyte at once, in a store the principal reaches, with Undo; Shopify makes it once the undo window
 * has passed and the row takes Shopify's id. Shopify refusing removes it again and tells whoever made it why. A draft
 * is not an order yet: the order commands refuse it, removing it deletes it in Shopify, and a draft Shopify completed
 * gives way to the real order.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

const draftOf = (storeId: string, email = "dewi@example.com") => ({
  storeId,
  customer: { name: "Dewi Kusuma", email },
  payment: "manual" as const,
  lines: [
    { sku: "WOL-1", title: "", quantity: 2, unitPriceMinor: 0 },
    { sku: "", title: "Cadeauverpakking", quantity: 1, unitPriceMinor: 350 }
  ],
  note: "Graag als cadeau inpakken"
})

const productOf = (title: string, sku = "") => ({
  title,
  sku,
  priceMinor: 2995,
  costMinor: 1200,
  supplierId: null,
  status: "draft" as const,
  description: "Zacht katoen.\n\nWasbaar op 30 graden."
})

/** Every write the window let through, run to the end. */
const written = async (writes: Awaited<ReturnType<typeof introspectWorkflow>>) => {
  const instances = await writes.get()
  for (const instance of instances) await instance.waitForStatus("complete")
  return (await Promise.all(instances.map((i) => i.getOutput()))).flat() as Array<Outcome>
}

const inbox = async (cookie: string) =>
  ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items

const hook = (shop: string, topic: string, body: unknown) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `wh-${run}-${topic}-${Math.random().toString(36).slice(2)}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify(body)
  })

describe("draft orders", () => {
  it("makes a draft in Insyte, then in Shopify after the window; the order commands leave it alone", async () => {
    const store = await importedStore("draft-make")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const made = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie))
    const draft = made.orders[0]!
    expect(draft).toMatchObject({
      isDraft: true,
      status: "placed",
      paymentStatus: "pending",
      customerName: "Dewi Kusuma",
      lineCount: 2,
      totalMinor: 2 * 8900 + 350
    })
    expect(draft.number).toMatch(/^SO-\d+$/)
    expect(draft.shopifyId).toBe(`insyte-${draft.id}`)
    expect(made.undo).not.toBeNull()
    const detail = ok(await rpc("Orders.get", { id: draft.id }, store.cookie))
    expect(detail.lines.map((l) => [l.title, l.quantity, l.unitPriceMinor])).toEqual([
      ["Wollen trui", 2, 8900],
      ["Cadeauverpakking", 1, 350]
    ])
    expect(detail.internalNote?.body).toBe("Graag als cadeau inpakken")
    expect(detail.paymentGateway).toBe("manual")

    // Nothing reaches Shopify inside the window; a draft is not tagged, fulfilled or cancelled.
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
    expect(failure(await rpc("Orders.tag", { ids: [draft.id], add: ["x"], remove: [] }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "draft" })
    expect(failure(await rpc("Orders.cancel", { ids: [draft.id], restock: false, notify: false }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "draft" })

    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes)).map((o) => o.outcome)).toEqual(["sent"])
    const sent = ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order
    expect(sent.shopifyId).toMatch(/^draft-\d+$/)

    // Shopify completed it into an order: the draft gives way, its note goes with the order.
    const draftId = sent.shopifyId.slice("draft-".length)
    expect(
      (await hook(store.shop, "draft_orders/update", { id: Number(draftId), status: "completed", order_id: 3 }))
        .status
    ).toBe(200)
    let gone = false
    for (let i = 0; i < 100 && !gone; i++) {
      gone = failure(await rpc("Orders.get", { id: draft.id }, store.cookie))?._tag === "NotFound"
      if (!gone) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(gone).toBe(true)
    const page = ok(await rpc("Orders.list", { limit: 50 }, store.cookie))
    const real = page.rows.find((o) => o.number === "#1003")!
    expect(ok(await rpc("Orders.get", { id: real.id }, store.cookie)).internalNote?.body)
      .toBe("Graag als cadeau inpakken")
  })

  it("undoes a draft inside the window, and removes one Shopify has", async () => {
    const store = await importedStore("draft-undo")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const undone = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie))
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, store.cookie))
    expect(failure(await rpc("Orders.get", { id: undone.orders[0]!.id }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    const kept = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes)).map((o) => o.outcome)).toEqual(["sent"])

    ok(await rpc("Orders.removeDraft", { id: kept.id }, store.cookie))
    expect(failure(await rpc("Orders.get", { id: kept.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    await relay(store.workspace)
    const outcomes = await written(writes)
    expect(outcomes.map((o) => o.outcome)).toEqual(["sent", "sent"])

    // An order of Shopify's own is not a draft to remove.
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => !o.isDraft)!
    expect(failure(await rpc("Orders.removeDraft", { id: order.id }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "not_draft" })
  })

  it("refuses what it cannot make, and tells the maker when Shopify will not", async () => {
    const store = await importedStore("draft-refuse")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    expect(
      failure(
        await rpc("Orders.createDraft", {
          ...draftOf(store.storeId),
          lines: [{ sku: "BESTAAT-NIET", title: "", quantity: 1, unitPriceMinor: 0 }]
        }, store.cookie)
      )
    )
      .toMatchObject({ _tag: "Invalid", fields: { "lines.0.sku": "unknown" } })
    expect(failure(await rpc("Orders.createDraft", draftOf(store.storeId, "geen-adres"), store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { "customer.email": "format" } })

    // Shopify refuses the address: the draft leaves Insyte, and its maker hears why.
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId, "invalid@example.com"), store.cookie))
      .orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes)).toEqual([{ id: draft.id, outcome: "refused", reason: "email" }])
    expect(failure(await rpc("Orders.get", { id: draft.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    await relay(store.workspace)
    const notes = await inbox(store.cookie)
    expect(notes.find((n) => n.subjectType === "shopify_create")).toMatchObject({
      kind: "integration.sync",
      subjectId: draft.id,
      data: { subject: "order", label: draft.number, reason: "email" }
    })
  })

  it("makes drafts only in a store the member reaches", async () => {
    const store = await importedStore("draft-fence")
    const email = `draft-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: ["sto_elsewhere"] }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const held = await join(email)
    expect(failure(await rpc("Orders.createDraft", draftOf(store.storeId), held)))
      .toMatchObject({ _tag: "NotFound", entity: "store" })
    expect(failure(await rpc("Products.create", { ...productOf("Trui"), storeId: store.storeId }, held)))
      .toMatchObject({ _tag: "NotFound", entity: "store" })
  })
})

describe("new products", () => {
  it("makes a product in Insyte, then in Shopify after the window with its price and SKU", async () => {
    const store = await importedStore("product-make")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const made = ok(await rpc("Products.create", productOf("Katoenen shirt", "KAT-1"), store.cookie))
    const product = made.products[0]!
    expect(product).toMatchObject({
      title: "Katoenen shirt",
      status: "draft",
      sku: "KAT-1",
      priceMinMinor: 2995,
      costMinor: 1200,
      variantCount: 1
    })
    expect(product.shopifyId).toBe(`insyte-${product.id}`)
    expect(failure(await rpc("Products.create", productOf("Ander shirt", "kat-1"), store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { sku: "taken" } })
    expect(failure(await rpc("Products.create", { ...productOf("Gratis"), priceMinor: 0 }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { priceMinor: "required" } })

    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes)).map((o) => o.outcome)).toEqual(["sent"])
    const detail = ok(await rpc("Products.get", { id: product.id }, store.cookie))
    expect(detail.product.shopifyId).toMatch(/^\d+$/)
    expect(detail.descriptionHtml).toBe("<p>Zacht katoen.</p><p>Wasbaar op 30 graden.</p>")
  })

  it("undoes a product inside the window; Shopify refusing one removes it and tells its maker", async () => {
    const store = await importedStore("product-refuse")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const undone = ok(await rpc("Products.create", productOf("Linnen tas"), store.cookie))
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, store.cookie))
    expect(failure(await rpc("Products.get", { id: undone.products[0]!.id }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    const refused = ok(await rpc("Products.create", productOf("Geweigerd shirt"), store.cookie)).products[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes)).toEqual([{ id: refused.id, outcome: "refused", reason: "title" }])
    expect(failure(await rpc("Products.get", { id: refused.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    await relay(store.workspace)
    expect((await inbox(store.cookie)).find((n) => n.subjectType === "shopify_create")).toMatchObject({
      subjectId: refused.id,
      data: { subject: "product", label: "Geweigerd shirt", reason: "title" }
    })
  })
})

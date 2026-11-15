import {
  completeRecordedDraft,
  copyRecordedDraft,
  recordedDrafts,
  recordedProducts
} from "@insyte/integrations-shopify/ShopifyRecorded"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Draft orders and new products (M7.1 "Nieuwe bestelling", M7.3 "Nieuw product"), against Shopify's recorded twin.
 * Each is made in Insyte at once, in a store the principal reaches, with Undo; Shopify makes it once the undo window
 * has passed, and the row takes Shopify's id in a step of its own. A send tried again after Shopify made it finds what
 * it made instead of making a second, and a few minutes later deletes a twin Shopify's lagging search let it make; a
 * product goes with its price and SKU in the same call; one removed while Shopify made it, or between a try whose
 * answer was lost and the next, is deleted there too. Shopify refusing removes it again and tells whoever made it why.
 * A draft is not an order yet: the order commands, the shopper's mail and the returns portal leave it alone, and a
 * draft Shopify completed gives way to the real order only once Insyte holds it, from its webhook or the sweep.
 */

type Outcome = { id: string; outcome: string; reason: string | null }
type Writes = Awaited<ReturnType<typeof introspectWorkflow>>

const draftOf = (storeId: string, email = "dewi@example.com") => ({
  storeId,
  customer: { name: "Dewi Kusuma", email },
  payment: "klarna" as const,
  lines: [
    { sku: "WOL-1", title: "", quantity: 2, unitPriceMinor: 0 },
    { sku: "", title: "Cadeauverpakking", quantity: 1, unitPriceMinor: 350 }
  ],
  note: "Graag als cadeau inpakken"
})

const productOf = (title: string, sku = "", status: "draft" | "active" = "draft") => ({
  title,
  sku,
  priceMinor: 2995,
  costMinor: 1200,
  supplierId: null,
  status,
  description: "Zacht katoen.\n\nWasbaar op 30 graden."
})

/** The Shopify writes this test starts, their sleeps off: a draft's last look for twins comes at once. */
const writesOf = async () => {
  const writes = await introspectWorkflow(env.SHOPIFY_WRITE)
  await writes.modifyAll(async (m) => {
    await m.disableSleeps()
  })
  return writes
}

/**
 * This workspace's Shopify writes among those the session saw: each is named by its outbox event (`sw-<id>`). Another
 * test's write (an earlier test's draft that its own kick sends once its window passed, a write of a test running
 * beside this one) can start while this one's session is open, and is not this test's.
 */
const ours = async (writes: Writes, workspace: string) => {
  const events = new Set((await outboxOf(workspace)).map((e) => `sw-${e.id}`))
  return (await writes.get()).filter((instance) => {
    const id = (instance as { readonly instanceId?: unknown }).instanceId
    if (typeof id !== "string") throw new Error("a workflow instance without its id")
    return events.has(id)
  })
}

/** Every write of this workspace the window let through, run to the end. */
const written = async (writes: Writes, workspace: string) => {
  const instances = await ours(writes, workspace)
  for (const instance of instances) await instance.waitForStatus("complete")
  return (await Promise.all(instances.map((i) => i.getOutput()))).flat() as Array<Outcome>
}

/** Until `check` holds, or it does not within ten seconds. */
const until = async (check: () => Promise<boolean> | boolean, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`never: ${what}`)
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

const numeric = (gid: string) => Number(gid.split("/").pop())

const mirrorOf = async (store: { workspace: string; storeId: string }) =>
  (await (await call(`http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`))
    .json()) as { inbound: Array<{ topic: string; processed: boolean; error: string | null }> }

describe("draft orders", () => {
  it("makes a draft in Insyte, then in Shopify after the window; the order commands leave it alone", async () => {
    const store = await importedStore("draft-make")
    await using writes = await writesOf()
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
    // The team's choice of payment is Insyte's own, shown while Shopify names none.
    expect(detail.paymentGateway).toBe("klarna")

    // Nothing reaches Shopify inside the window; a draft is not tagged, cancelled, or mailed about.
    await relay(store.workspace)
    expect(await ours(writes, store.workspace)).toHaveLength(0)
    expect(failure(await rpc("Orders.tag", { ids: [draft.id], add: ["x"], remove: [] }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "draft" })
    expect(failure(await rpc("Orders.cancel", { ids: [draft.id], restock: false, notify: false }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "draft" })
    expect(
      failure(
        await rpc("Orders.emailCustomer", { orderId: draft.id, subject: "Je bestelling", body: "Hoi" }, store.cookie)
      )
    ).toMatchObject({ _tag: "Conflict", reason: "draft" })

    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    const sent = ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order
    expect(sent.shopifyId).toMatch(/^draft-\d+$/)
    const draftGid = `gid://shopify/DraftOrder/${sent.shopifyId.slice("draft-".length)}`
    // Shopify got the lines, the address and the number to find it by.
    const inShopify = recordedDrafts(store.shop).find((d) => d.id === draftGid)!
    expect(inShopify).toMatchObject({ email: "dewi@example.com", tags: ["insyte", draft.number] })
    expect(inShopify.lines).toHaveLength(2)

    // The merchant completes it in Shopify: the draft gives way to the new order, its note and payment with it.
    const order = completeRecordedDraft(draftGid)
    expect(
      (await hook(store.shop, "draft_orders/update", {
        id: numeric(draftGid),
        status: "completed",
        order_id: numeric(order.id)
      })).status
    ).toBe(200)
    await until(
      async () => failure(await rpc("Orders.get", { id: draft.id }, store.cookie))?._tag === "NotFound",
      "the draft gave way"
    )
    const page = ok(await rpc("Orders.list", { limit: 50 }, store.cookie))
    const real = page.rows.find((o) => o.number === order.name)!
    expect(real.isDraft).toBe(false)
    const after = ok(await rpc("Orders.get", { id: real.id }, store.cookie))
    expect(after.internalNote?.body).toBe("Graag als cadeau inpakken")
    expect(after.paymentGateway).toBe("klarna")
  })

  it("keeps a completed draft, note and all, until Insyte holds the order it became", async () => {
    const store = await importedStore("draft-wait")
    await using writes = await writesOf()
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await written(writes, store.workspace)
    const sent = ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order
    // Completed into an order Shopify does not answer for (yet): the delivery fails and is tried again later.
    expect(
      (await hook(store.shop, "draft_orders/update", {
        id: Number(sent.shopifyId.slice("draft-".length)),
        status: "completed",
        order_id: 987654
      })).status
    ).toBe(200)
    await until(
      async () =>
        (await mirrorOf(store)).inbound.some((e) =>
          e.topic === "draft_orders/update" && !e.processed && (e.error ?? "").includes("DraftNotCompleted")
        ),
      "the delivery failed, to be tried again"
    )
    const kept = ok(await rpc("Orders.get", { id: draft.id }, store.cookie))
    expect(kept.order.isDraft).toBe(true)
    expect(kept.internalNote?.body).toBe("Graag als cadeau inpakken")

    // Shopify gave up on the delivery; the sweep finds the draft completed, mirrors its order and retires it.
    const order = completeRecordedDraft(`gid://shopify/DraftOrder/${sent.shopifyId.slice("draft-".length)}`)
    const swept = await call(
      `http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sweep: true, check: false })
      }
    )
    expect(swept.status).toBe(200)
    expect(failure(await rpc("Orders.get", { id: draft.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    const real = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === order.name)!
    const after = ok(await rpc("Orders.get", { id: real.id }, store.cookie))
    expect(after.order.isDraft).toBe(false)
    expect(after.internalNote?.body).toBe("Graag als cadeau inpakken")
    expect(after.paymentGateway).toBe("klarna")
  })

  it("undoes a draft inside the window, and removes one Shopify has", async () => {
    const store = await importedStore("draft-undo")
    await using writes = await writesOf()
    const undone = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie))
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, store.cookie))
    expect(failure(await rpc("Orders.get", { id: undone.orders[0]!.id }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    const kept = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    expect(recordedDrafts(store.shop).filter((d) => d.tags.includes(kept.number))).toHaveLength(1)

    ok(await rpc("Orders.removeDraft", { id: kept.id }, store.cookie))
    expect(failure(await rpc("Orders.get", { id: kept.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    await relay(store.workspace)
    const outcomes = await written(writes, store.workspace)
    expect(outcomes.map((o) => o.outcome)).toEqual(["sent", "sent"])
    expect(recordedDrafts(store.shop).filter((d) => d.tags.includes(kept.number))).toHaveLength(0)

    // An order of Shopify's own is not a draft to remove.
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => !o.isDraft)!
    expect(failure(await rpc("Orders.removeDraft", { id: order.id }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "not_draft" })
  })

  it("deletes in Shopify a draft removed while Shopify made it", async () => {
    const store = await importedStore("draft-midway")
    await using writes = await writesOf()
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    // The row takes Shopify's id a step later than Shopify made it: here, five seconds later.
    await writes.modifyAll(async (m) => {
      await m.mockStepError({ name: `order ${draft.id} adopt` }, new Error("the isolate went away"), 1)
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await until(() => recordedDrafts(store.shop).some((d) => d.tags.includes(draft.number)), "Shopify made it")
    // Shopify has it, Insyte does not know yet: removing it sends nothing of its own…
    expect(ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order.shopifyId).toBe(`insyte-${draft.id}`)
    ok(await rpc("Orders.removeDraft", { id: draft.id }, store.cookie))
    // …and the step that would have adopted it deletes it in Shopify instead.
    expect(await written(writes, store.workspace)).toEqual([{ id: draft.id, outcome: "skipped", reason: "removed" }])
    expect(recordedDrafts(store.shop).filter((d) => d.tags.includes(draft.number))).toHaveLength(0)
  })

  it("finds the draft Shopify made when its answer was lost, instead of making a second", async () => {
    const store = await importedStore("draft-lost", "lost")
    await using writes = await writesOf()
    await writes.modifyAll(async (m) => {
      await m.disableRetryDelays()
    })
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    const inShopify = recordedDrafts(store.shop).filter((d) => d.tags.includes(draft.number))
    expect(inShopify).toHaveLength(1)
    expect(ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order.shopifyId)
      .toBe(`draft-${numeric(inShopify[0]!.id)}`)
  })

  it("deletes, a few minutes on, the twin a lagging search let a retry make, never a copy made after", async () => {
    // Shopify's search misses a draft on its first search after it was made: the retry, five seconds on, makes a second.
    const store = await importedStore("draft-lag", "lost")
    await using writes = await writesOf()
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    // The last look is held back once, five seconds, for the merchant to copy the draft in Shopify's admin.
    await writes.modifyAll(async (m) => {
      await m.mockStepError({ name: `order ${draft.id} twins` }, new Error("the isolate went away"), 1)
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const adopted = async () => ok(await rpc("Orders.get", { id: draft.id }, store.cookie)).order.shopifyId
    await until(async () => (await adopted()).startsWith("draft-"), "the draft took Shopify's id")
    const kept = `gid://shopify/DraftOrder/${(await adopted()).slice("draft-".length)}`
    const tagged = () => recordedDrafts(store.shop).filter((d) => d.tags.includes(draft.number))
    expect(tagged().find((d) => d.id !== kept)).toBeDefined()
    // The merchant's copy carries the number too, and was made two minutes after the draft took its id.
    const copy = copyRecordedDraft(kept, new Date(Date.now() + 120_000))

    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    // The twin from before the adopt step is gone; Insyte's draft and the merchant's copy stay.
    expect(tagged().map((d) => d.id).toSorted()).toEqual([kept, copy].toSorted())
  })

  it("deletes the draft a lost answer left in Shopify when it is removed before the retry", async () => {
    const store = await importedStore("draft-gone", "lost")
    await using writes = await writesOf()
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId), store.cookie)).orders[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    // Shopify made it, its answer was lost, and the retry is five seconds off: removed in Insyte meanwhile…
    await until(() => recordedDrafts(store.shop).some((d) => d.tags.includes(draft.number)), "Shopify made it")
    ok(await rpc("Orders.removeDraft", { id: draft.id }, store.cookie))
    // …the retry finds it by its number and deletes it there too.
    expect(await written(writes, store.workspace)).toEqual([{ id: draft.id, outcome: "skipped", reason: "gone" }])
    expect(recordedDrafts(store.shop).filter((d) => d.tags.includes(draft.number))).toHaveLength(0)
  })

  it("refuses what it cannot make, and tells the maker when Shopify will not", async () => {
    const store = await importedStore("draft-refuse")
    await using writes = await writesOf()
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
    expect(await written(writes, store.workspace)).toEqual([{ id: draft.id, outcome: "refused", reason: "email" }])
    expect(failure(await rpc("Orders.get", { id: draft.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    await relay(store.workspace)
    const notes = await inbox(store.cookie)
    expect(notes.find((n) => n.subjectType === "shopify_create")).toMatchObject({
      kind: "integration.sync",
      subjectId: draft.id,
      data: { subject: "order", label: draft.number, reason: "email" }
    })
  })

  it("is no order to the returns portal", async () => {
    const store = await importedStore("draft-portal")
    const settings = ok(await rpc("Returns.settings", undefined, store.cookie))
    ok(
      await rpc("Returns.setSettings", {
        ...settings,
        returnDays: 365,
        claimDays: 365,
        portal: { ...settings.portal, on: true }
      }, store.cookie)
    )
    const handle = settings.portal.handle
    const draft = ok(await rpc("Orders.createDraft", draftOf(store.storeId, "klant1@example.com"), store.cookie))
      .orders[0]!
    // The draft's number and address, as a shopper would type them: no order of theirs.
    for (const number of [draft.number, draft.number.slice("SO-".length)]) {
      expect(failure(await rpc("Portal.lookup", { handle, number, email: "klant1@example.com" })))
        .toMatchObject({ _tag: "OrderNotFound" })
    }
    // The shopper's real order still is.
    ok(await rpc("Portal.lookup", { handle, number: "#1002", email: "klant1@example.com" }))
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
  it("makes a product in Insyte, then in Shopify after the window with its price and SKU in one call", async () => {
    const store = await importedStore("product-make")
    await using writes = await writesOf()
    const made = ok(
      await rpc(
        "Products.create",
        { ...productOf("Katoenen shirt", "KAT-1", "active"), storeId: store.storeId },
        store.cookie
      )
    )
    const product = made.products[0]!
    expect(product).toMatchObject({
      title: "Katoenen shirt",
      status: "active",
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
    expect(await ours(writes, store.workspace)).toHaveLength(0)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    // Shopify got it on sale with its price and SKU together, never at nothing.
    const [inShopify, ...more] = recordedProducts(store.shop)
    expect(more).toHaveLength(0)
    expect(inShopify).toMatchObject({ title: "Katoenen shirt", status: "ACTIVE", price: "29.95", sku: "KAT-1" })
    expect(inShopify!.handle).toMatch(/^katoenen-shirt-[a-z0-9]{6}$/)
    const detail = ok(await rpc("Products.get", { id: product.id }, store.cookie))
    expect(detail.product.shopifyId).toBe(String(numeric(inShopify!.id)))
    expect(detail.descriptionHtml).toBe("<p>Zacht katoen.</p><p>Wasbaar op 30 graden.</p>")
  })

  it("finds the product Shopify made when its answer was lost, instead of making a second", async () => {
    const store = await importedStore("product-lost", "lost")
    await using writes = await writesOf()
    await writes.modifyAll(async (m) => {
      await m.disableRetryDelays()
    })
    const product = ok(await rpc("Products.create", productOf("Linnen broek", "LIN-B"), store.cookie)).products[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    const inShopify = recordedProducts(store.shop)
    expect(inShopify).toHaveLength(1)
    expect(inShopify[0]).toMatchObject({ title: "Linnen broek", price: "29.95", sku: "LIN-B", status: "DRAFT" })
    expect(ok(await rpc("Products.get", { id: product.id }, store.cookie)).product.shopifyId)
      .toBe(String(numeric(inShopify[0]!.id)))
  })

  it("deletes the product a lost answer left in Shopify when it is gone before the retry", async () => {
    const store = await importedStore("product-gone", "lost")
    await using writes = await writesOf()
    const product = ok(await rpc("Products.create", productOf("Linnen jas", "LIN-J"), store.cookie)).products[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await until(() => recordedProducts(store.shop).length === 1, "Shopify made it")
    // Gone from Insyte as an undo from the agent log leaves it, before the retry five seconds on.
    const unmade = await call(
      `http://api.test/api/__dev/stores/unmake?workspace=${store.workspace}&product=${product.id}`,
      { method: "POST" }
    )
    expect(await unmade.json()).toEqual({ gone: true })
    expect(await written(writes, store.workspace)).toEqual([{ id: product.id, outcome: "skipped", reason: "gone" }])
    expect(recordedProducts(store.shop)).toHaveLength(0)
  })

  it("keeps its own row when Shopify's echo arrives before the row took Shopify's ids", async () => {
    const store = await importedStore("product-echo")
    await using writes = await writesOf()
    const product = ok(await rpc("Products.create", productOf("Katoenen echo", "KAT-E"), store.cookie)).products[0]!
    await writes.modifyAll(async (m) => {
      await m.mockStepError({ name: `product ${product.id} adopt` }, new Error("the isolate went away"), 1)
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await until(() => recordedProducts(store.shop).length === 1, "Shopify made it")
    const gid = recordedProducts(store.shop)[0]!.id
    // `products/create` mirrors Shopify's product as a row of its own, beside Insyte's still waiting for its ids.
    expect((await hook(store.shop, "products/create", { id: numeric(gid) })).status).toBe(200)
    const titled = async () =>
      ok(await rpc("Products.list", { limit: 50 }, store.cookie)).rows.filter((p) => p.title === "Katoenen echo")
    await until(async () => (await titled()).length === 2, "the echo mirrored")
    // Shopify's stock for it lands on the echo, the only row that knows its inventory item yet.
    const item = numeric(recordedProducts(store.shop)[0]!.item)
    const level = await hook(store.shop, "inventory_levels/update", {
      inventory_item_id: item,
      location_id: 900,
      available: 7,
      updated_at: new Date().toISOString()
    })
    expect(level.status).toBe(200)
    await until(async () => (await titled()).some((p) => p.id !== product.id && p.available === 7), "the stock landed")

    expect((await written(writes, store.workspace)).map((o) => o.outcome)).toEqual(["sent"])
    const left = await titled()
    expect(left).toHaveLength(1)
    // Insyte's row stays, with the stock the echo held.
    expect(left[0]).toMatchObject({
      id: product.id,
      shopifyId: String(numeric(gid)),
      costMinor: 1200,
      sku: "KAT-E",
      available: 7
    })
  })

  it("undoes a product inside the window; Shopify refusing one removes it and tells its maker", async () => {
    const store = await importedStore("product-refuse")
    await using writes = await writesOf()
    const undone = ok(await rpc("Products.create", productOf("Linnen tas"), store.cookie))
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, store.cookie))
    expect(failure(await rpc("Products.get", { id: undone.products[0]!.id }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    const refused = ok(await rpc("Products.create", productOf("Geweigerd shirt"), store.cookie)).products[0]!
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await written(writes, store.workspace)).toEqual([{ id: refused.id, outcome: "refused", reason: "title" }])
    expect(failure(await rpc("Products.get", { id: refused.id }, store.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(recordedProducts(store.shop)).toHaveLength(0)
    await relay(store.workspace)
    expect((await inbox(store.cookie)).find((n) => n.subjectType === "shopify_create")).toMatchObject({
      subjectId: refused.id,
      data: { subject: "product", label: "Geweigerd shirt", reason: "title" }
    })
  })
})

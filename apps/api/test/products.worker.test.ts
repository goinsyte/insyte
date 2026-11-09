import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * The product commands (step 9.3, M7.3), against Shopify's recorded twin. An edit changes the product in Insyte at once
 * with an undo token; Shopify hears it once the window has passed, read as it is then. The cost price is Insyte's own:
 * changing only it sends nothing. "Marges herberekenen" previews before it applies, and a product without a cost keeps
 * its price. A store whose Shopify refuses gets its product read again.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

const productTitled = async (cookie: string, title: string) => {
  const page = ok(await rpc("Products.list", { limit: 50 }, cookie))
  return page.rows.find((p) => p.title === title)!
}

describe("the product commands", () => {
  it("edits a product, tells Shopify after the window, and keeps the cost price Insyte's own", async () => {
    const store = await importedStore("prd-edit")
    const linen = await productTitled(store.cookie, "Linnen overhemd")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    const edited = ok(
      await rpc("Products.edit", {
        id: linen.id,
        title: "Linnen overhemd wit",
        description: "Zacht linnen.\n\nWasbaar op 30 graden.",
        priceMinor: 5495,
        costMinor: 1800
      }, store.cookie)
    )
    expect(edited.products[0]).toMatchObject({
      title: "Linnen overhemd wit",
      priceMinMinor: 5495,
      priceMaxMinor: 5495,
      costMinor: 1800
    })
    expect(ok(await rpc("Products.get", { id: linen.id }, store.cookie)).descriptionHtml)
      .toBe("<p>Zacht linnen.</p><p>Wasbaar op 30 graden.</p>")

    // Inside the window Shopify hears nothing; after it, the product as it is then.
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect(await instance!.getOutput()).toEqual([{ id: linen.id, outcome: "sent", reason: null }])

    // The cost price alone: undoable, and nothing for Shopify.
    const costed = ok(await rpc("Products.edit", { id: linen.id, costMinor: 2000 }, store.cookie))
    expect(costed.undo).not.toBeNull()
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(1)

    // Nothing changed is no change.
    expect(ok(await rpc("Products.edit", { id: linen.id, title: "Linnen overhemd wit" }, store.cookie)))
      .toMatchObject({ products: [], undo: null })
  })

  it("undoes an edit inside the window, and nothing reaches Shopify", async () => {
    const store = await importedStore("prd-undo")
    const wool = await productTitled(store.cookie, "Wollen trui")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const edited = ok(
      await rpc("Products.edit", { id: wool.id, status: "draft", priceMinor: 9900, costMinor: 3000 }, store.cookie)
    )
    ok(await rpc("Shared.undo", { token: edited.undo!.token }, store.cookie))
    expect(ok(await rpc("Products.get", { id: wool.id }, store.cookie)).product).toMatchObject({
      status: "active",
      priceMinMinor: 8900,
      costMinor: null
    })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)
  })

  it("previews and applies new prices at a target margin, and sets the status of many", async () => {
    const store = await importedStore("prd-margin")
    const linen = await productTitled(store.cookie, "Linnen overhemd")
    const wool = await productTitled(store.cookie, "Wollen trui")
    const bag = await productTitled(store.cookie, "Canvas tas")
    ok(await rpc("Products.edit", { id: linen.id, costMinor: 2000 }, store.cookie))
    ok(await rpc("Products.edit", { id: wool.id, costMinor: 3560 }, store.cookie))

    const preview = ok(
      await rpc("Products.reprice", { ids: [linen.id, wool.id, bag.id], targetMargin: 0.6, apply: false }, store.cookie)
    )
    expect(preview.undo).toBeNull()
    expect(Object.fromEntries(preview.rows.map((r) => [r.id, [r.priceMinor, r.nextMinor, r.skipped]]))).toEqual({
      [linen.id]: [4995, 5000, null],
      [wool.id]: [8900, 8900, null],
      [bag.id]: [2450, null, "no_cost"]
    })
    expect(ok(await rpc("Products.get", { id: linen.id }, store.cookie)).product.priceMinMinor).toBe(4995)

    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const applied = ok(
      await rpc("Products.reprice", { ids: [linen.id, wool.id, bag.id], targetMargin: 0.6, apply: true }, store.cookie)
    )
    expect(applied.undo).not.toBeNull()
    expect(ok(await rpc("Products.get", { id: linen.id }, store.cookie)).product.priceMinMinor).toBe(5000)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    // Only the product whose price changed goes to Shopify.
    expect((await instance!.getOutput() as Array<Outcome>).map((o) => o.id)).toEqual([linen.id])

    const drafted = ok(await rpc("Products.setStatus", { ids: [linen.id, bag.id], status: "draft" }, store.cookie))
    expect(drafted.products.map((p) => p.status)).toEqual(["draft", "draft"])
    expect(failure(await rpc("Products.edit", { id: "prd_none", title: "x" }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })
  })

  it("reads the product again when Shopify refuses the write", async () => {
    const store = await importedStore("prd-refuse", "refuse")
    const bag = await productTitled(store.cookie, "Canvas tas")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Products.edit", { id: bag.id, title: "Canvas shopper" }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect((await instance!.getOutput() as Array<Outcome>)[0]).toMatchObject({ outcome: "refused" })
    expect(ok(await rpc("Products.get", { id: bag.id }, store.cookie)).product.title).toBe("Canvas tas")
  })

  it("reads a product again from Shopify on request", async () => {
    const store = await importedStore("prd-sync")
    const bag = await productTitled(store.cookie, "Canvas tas")
    ok(await rpc("Products.edit", { id: bag.id, title: "Lokaal anders" }, store.cookie))
    ok(await rpc("Products.sync", { id: bag.id }, store.cookie))
    expect(ok(await rpc("Products.get", { id: bag.id }, store.cookie)).product.title).toBe("Canvas tas")
  })
})

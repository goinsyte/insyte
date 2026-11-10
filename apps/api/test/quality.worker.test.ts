import { describe, expect, it } from "vitest"
import { failure, ok, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Product quality (step 11.6, M9.4), against Shopify's recorded twin: the linen shirt is Atelier Noord's, in M and L;
 * the canvas bag has no supplier. The team asks the supplier for a check, the supplier answers through the signed link
 * (photos and the batch number), the team hears of it and judges it, each step with its Undo. Quality returns are the
 * complaints; the phase has its Undo.
 */

const DAY = 86_400_000

const productNamed = async (cookie: string, title: string) =>
  ok(await rpc("Products.list", {}, cookie)).rows.find((p) => p.title === title)!

const undo = async (cookie: string, token: string | undefined) =>
  ok(await rpc("Shared.undo", { token: token! }, cookie))

const media = (token: string, type = "image/png") =>
  call("http://api.test/api/quality/media", {
    method: "PUT",
    headers: { "content-type": type, "x-check-token": token, "x-file-name": encodeURIComponent("naad.png") },
    body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  })

describe("quality", () => {
  it("asks the supplier, takes the answer through the link, and judges it with Undo", async () => {
    const store = await importedStore("qc-life")
    const linen = await productNamed(store.cookie, "Linnen overhemd")
    const bag = await productNamed(store.cookie, "Canvas tas")

    const empty = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie))
    expect(empty).toMatchObject({
      supplier: { name: "Atelier Noord" },
      phase: "active",
      threshold: 0.05,
      checks: [],
      sizes: ["M", "L"]
    })

    const ask = {
      productId: linen.id,
      kind: "batch" as const,
      variants: ["M"],
      deliverables: ["photos" as const, "batch" as const],
      dueAt: Date.now() + 4 * DAY,
      note: "Zes foto's van de nieuwe batch en het batchnummer"
    }
    expect(failure(await rpc("Quality.request", { ...ask, productId: bag.id }, store.cookie))).toMatchObject({
      _tag: "NoSupplier"
    })
    expect(failure(await rpc("Quality.request", { ...ask, dueAt: Date.now() - DAY }, store.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { dueAt: "range" }
    })
    // Asked in error: Undo takes it away.
    await undo(store.cookie, ok(await rpc("Quality.request", ask, store.cookie)).undo?.token)
    expect(ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).checks).toEqual([])

    const { checkId } = ok(await rpc("Quality.request", ask, store.cookie))
    const id = checkId!
    expect(failure(await rpc("Quality.approve", { id }, store.cookie))).toMatchObject({
      _tag: "IllegalCheckMove",
      from: "requested"
    })

    // The supplier's link: what was asked, and an answer that must hold what was asked for.
    const { path } = ok(await rpc("Quality.link", { id }, store.cookie))
    const token = decodeURIComponent(new URL(path, "http://console").searchParams.get("k")!)
    expect(ok(await rpc("QualityLink.check", { token }))).toMatchObject({
      productTitle: "Linnen overhemd",
      supplierName: "Atelier Noord",
      kind: "batch",
      variants: ["M"],
      status: "requested",
      rejection: null
    })
    expect(failure(await rpc("QualityLink.check", { token: `${token.slice(0, -4)}AAAA` }))).toMatchObject({
      _tag: "LinkExpired"
    })
    expect(failure(await rpc("QualityLink.submit", { token, fileIds: [], batch: "B-17" }))).toMatchObject({
      _tag: "DeliverableMissing",
      what: "photos"
    })
    expect((await media("v1.nope.nope.nope")).status).toBe(401)
    expect((await media(token, "application/zip")).status).toBe(415)
    const uploaded = await media(token)
    expect(uploaded.status).toBe(201)
    const { id: fileId } = await uploaded.json() as { id: string }
    expect(failure(await rpc("QualityLink.submit", { token, fileIds: [fileId] }))).toMatchObject({
      _tag: "DeliverableMissing",
      what: "batch"
    })
    ok(await rpc("QualityLink.submit", { token, fileIds: [fileId], batch: "B-17", note: "Nieuwe naden", by: "Marco" }))

    // The team hears of it, and sees what came back.
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "supplier.message")).toMatchObject({
      subjectId: id,
      data: { productId: linen.id, product: "Linnen overhemd", by: "Marco", photos: 1, batch: "B-17" }
    })
    const submitted = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).checks[0]!
    expect(submitted).toMatchObject({
      status: "submitted",
      submission: { by: "Marco", photos: [`/api/files/${fileId}`], batch: "B-17", note: "Nieuwe naden", video: false }
    })
    expect((await call(`http://api.test/api/files/${fileId}`, { headers: { cookie: store.cookie } })).status).toBe(200)

    // Rejected and under watch in one move; Undo puts both back.
    const rejected = ok(
      await rpc("Quality.reject", { id, note: "Naad loopt niet door tot de zoom", watch: true }, store.cookie)
    )
    const watched = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie))
    expect(watched.phase).toBe("watch")
    expect(watched.checks[0]).toMatchObject({
      status: "rejected",
      verdict: { reason: "Naad loopt niet door tot de zoom" }
    })
    expect(ok(await rpc("QualityLink.check", { token })).rejection).toBe("Naad loopt niet door tot de zoom")
    await undo(store.cookie, rejected.undo?.token)
    const back = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie))
    expect(back.phase).toBe("active")
    expect(back.checks[0]).toMatchObject({ status: "submitted", verdict: null })

    ok(await rpc("Quality.approve", { id }, store.cookie))
    const approved = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).checks[0]!
    expect(approved.status).toBe("approved")
    expect(approved.verdict!.by).not.toBe("")
    // Approved, the link takes nothing more.
    expect(failure(await rpc("QualityLink.submit", { token, fileIds: [fileId], batch: "B-18" }))).toMatchObject({
      _tag: "IllegalCheckMove",
      from: "approved"
    })
  })

  it("counts quality returns as complaints, and sets the phase with Undo", async () => {
    const store = await importedStore("qc-rate")
    const linen = await productNamed(store.cookie, "Linnen overhemd")

    const phased = ok(await rpc("Quality.setPhase", { productId: linen.id, phase: "test" }, store.cookie))
    expect(ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).phase).toBe("test")
    await undo(store.cookie, phased.undo?.token)
    expect(ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).phase).toBe("active")

    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1003")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const started = ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "quality",
        requested: "replacement",
        note: "De naad laat los"
      }, store.cookie)
    ).returns[0]!
    const rated = ok(await rpc("Quality.list", { productId: linen.id }, store.cookie))
    expect(rated.complaints).toEqual([
      expect.objectContaining({ returnId: started.id, text: "De naad laat los", customer: "Klant 2" })
    ])
    expect(rated.sold90).toBeGreaterThanOrEqual(0)

    // A rejected return is no complaint.
    ok(await rpc("Returns.reject", { ids: [started.id], reason: "Gedragen" }, store.cookie))
    expect(ok(await rpc("Quality.list", { productId: linen.id }, store.cookie)).complaints).toEqual([])
  })
})

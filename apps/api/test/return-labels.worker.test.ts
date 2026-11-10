import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Return labels (step 11.4, M9.2), against Sendcloud's recorded twin. "Label versturen" asks for one; Undo takes it
 * back before anything reaches the carrier; once the window has passed the label is made, its PDF kept and downloadable
 * at Retouren · Bekijken. Without a return address it is refused; a carrier's refusal marks it failed, and asking again
 * is allowed.
 */

const ADDRESS = {
  country: "NL",
  label: "Nederland",
  address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam",
  carrier: "PostNL" as const,
  name: "Northwind Retouren",
  line1: "Distributieweg 12",
  postcode: "3045 AB",
  city: "Rotterdam"
}

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

const withAddress = async (cookie: string, address: typeof ADDRESS) => {
  const settings = ok(await rpc("Returns.settings", undefined, cookie))
  ok(await rpc("Returns.setSettings", { ...settings, addresses: [address] }, cookie))
}

describe("return labels", () => {
  it("asks for a label with Undo, makes it after the window, and keeps its PDF for the team", async () => {
    const store = await importedStore("lbl-life")
    const r = await waiting(store.cookie, "#1002")

    // No return address yet: nothing to send the parcel to.
    expect(failure(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie))).toMatchObject({
      _tag: "LabelNotPossible",
      why: "no_return_address"
    })
    await withAddress(store.cookie, ADDRESS)

    // Asked for in error: Undo takes it back, and the carrier never hears of it.
    const mistaken = ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie))
    expect(mistaken.returns[0]!.labelRequest).toEqual({ state: "requested", reason: null })
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    expect(ok(await rpc("Returns.get", { id: r.id }, store.cookie)).record.labelRequest).toBeNull()

    await using labels = await introspectWorkflow(env.RETURN_LABEL)
    ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie))
    // Asked again while it is on its way: left as it is.
    expect(ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie)).returns).toEqual([])
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await labels.get()
    await instance!.waitForStatus("complete")

    const detail = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(detail.record.labelRequest).toBeNull()
    expect(detail.record.label).toMatchObject({
      carrier: "PostNL",
      tracking: `3SRET${r.number.replace(/\D/g, "")}`,
      trackingUrl: expect.stringContaining("3SRET")
    })
    expect(detail.events.at(-1)).toMatchObject({ who: "insyte", text: "Retourlabel van PostNL gemaakt" })

    const pdf = await call(`http://api.test/api/files/${detail.record.label!.fileId}`, {
      headers: { cookie: store.cookie }
    })
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get("content-type")).toBe("application/pdf")
    expect(pdf.headers.get("content-disposition")).toContain(`retourlabel-${r.number}.pdf`)
    expect((await call(`http://api.test/api/files/${detail.record.label!.fileId}`)).status).toBe(401)

    // A label made is not asked for again.
    expect(ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie)).returns).toEqual([])
  })

  it("marks a label the carrier refuses as failed, with why, and lets it be asked again", async () => {
    const store = await importedStore("lbl-refused")
    const r = await waiting(store.cookie, "#1003")
    await withAddress(store.cookie, { ...ADDRESS, city: "BADTOWN" })

    await using labels = await introspectWorkflow(env.RETURN_LABEL)
    ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await labels.get()
    await instance!.waitForStatus("complete")

    const detail = ok(await rpc("Returns.get", { id: r.id }, store.cookie))
    expect(detail.record.label).toBeNull()
    expect(detail.record.labelRequest).toEqual({
      state: "failed",
      reason: "Sendcloud antwoordde 400: postcode onbekend"
    })
    expect(detail.events.at(-1)!.text).toBe(
      "Retourlabel kon niet worden gemaakt: Sendcloud antwoordde 400: postcode onbekend"
    )

    await withAddress(store.cookie, ADDRESS)
    expect(ok(await rpc("Returns.sendLabel", { ids: [r.id] }, store.cookie)).returns[0]!.labelRequest)
      .toMatchObject({ state: "requested" })
  })

  it("is only for a return waiting for its parcel", async () => {
    const store = await importedStore("lbl-status")
    await withAddress(store.cookie, ADDRESS)
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
    expect(failure(await rpc("Returns.sendLabel", { ids: [inReview.id] }, store.cookie))).toMatchObject({
      _tag: "IllegalReturnMove",
      from: "review"
    })
  })
})

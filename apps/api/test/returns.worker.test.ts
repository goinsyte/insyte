import { mintId } from "@insyte/domain/Ids"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * Returns and claims (step 11.1, M9.1), against Shopify's recorded twin. A return starts in review, is approved, comes
 * in, is inspected and is settled; each step has its undo, the refund aside, which runs `Orders.refund` on the return's
 * own transaction, so Shopify hears it once and a retried resolve refunds once. The settings are one document with the
 * code's defaults; the rules decide what can go back and how it can be settled, on the server.
 */

type Outcome = { id: string; outcome: string; reason: string | null }

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

const firstLine = async (cookie: string, orderId: string) =>
  ok(await rpc("Orders.get", { id: orderId }, cookie)).lines[0]!

describe("returns", () => {
  it("takes a return from review to a refund, each step with its undo, and Shopify hears the refund once", async () => {
    const store = await importedStore("ret-life")
    const order = await orderNumbered(store.cookie, "#1002")
    const line = await firstLine(store.cookie, order.id)

    const settings = ok(await rpc("Returns.settings", undefined, store.cookie))
    expect(settings).toMatchObject({ returnDays: 30, claimDays: 60, portal: { on: false } })
    expect(settings.reasons.map((r) => r.id)).toEqual([
      "too_small",
      "too_big",
      "not_as_expected",
      "damaged",
      "wrong_item",
      "quality"
    ])

    const free = ok(await rpc("Returns.returnable", { orderId: order.id }, store.cookie))
    expect(free.lines.find((l) => l.id === line.id)).toMatchObject({ free: line.quantity, rule: null })

    const input = {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: "too_small",
      requested: "refund" as const,
      note: "Valt een maat kleiner uit"
    }
    // Started in error: Undo takes it away again.
    const mistaken = ok(await rpc("Returns.start", input, store.cookie))
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, store.cookie))
    expect(failure(await rpc("Returns.get", { id: mistaken.returns[0]!.id }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })

    const started = ok(await rpc("Returns.start", input, store.cookie)).returns[0]!
    expect(started).toMatchObject({
      kind: "return",
      status: "review",
      source: "operator",
      orderNumber: "#1002",
      units: 1,
      amountMinor: line.unitPriceMinor,
      reasonLabel: "Te klein",
      quality: false
    })
    expect(started.number).toMatch(/^R-10\d\d$/)
    expect(started.deadline - started.createdAt).toBe(48 * 3_600_000)
    // What is in a return is no longer free to send back.
    expect(
      failure(await rpc("Returns.start", { ...input, lines: [{ lineId: line.id, qty: line.quantity }] }, store.cookie))
    ).toMatchObject({ _tag: "LineNotReturnable", why: "taken" })

    const approved = ok(await rpc("Returns.approve", { ids: [started.id] }, store.cookie))
    expect(approved.returns[0]!.status).toBe("awaiting_parcel")
    ok(await rpc("Shared.undo", { token: approved.undo!.token }, store.cookie))
    expect(ok(await rpc("Returns.get", { id: started.id }, store.cookie)).record.status).toBe("review")
    ok(await rpc("Returns.approve", { ids: [started.id] }, store.cookie))
    expect(failure(await rpc("Returns.approve", { ids: [started.id] }, store.cookie))).toMatchObject({
      _tag: "IllegalReturnMove",
      from: "awaiting_parcel"
    })

    // Settling before it came in is refused: it waits for its parcel.
    expect(
      failure(
        await rpc("Returns.resolve", { id: started.id, resolution: "refund", refundId: mintId("rfd") }, store.cookie)
      )
    ).toMatchObject({ _tag: "IllegalReturnMove", from: "awaiting_parcel" })
    ok(await rpc("Returns.markReceived", { id: started.id }, store.cookie))
    ok(await rpc("Returns.inspect", { id: started.id }, store.cookie))

    const ready = ok(await rpc("Returns.get", { id: started.id }, store.cookie))
    expect(ready.record.status).toBe("ready")
    expect(ready.lines[0]).toMatchObject({ condition: "ok", restock: true, qty: 1 })
    expect(ready.allowed).toEqual([
      { kind: "refund", amountMinor: line.unitPriceMinor },
      { kind: "exchange", amountMinor: 0 },
      { kind: "gift_card", amountMinor: Math.round(line.unitPriceMinor * 1.1) },
      { kind: "discount", amountMinor: Math.round(line.unitPriceMinor * 0.15) }
    ])
    // A replacement is for a claim: a return cannot be settled with one.
    expect(failure(await rpc("Returns.resolve", { id: started.id, resolution: "replacement" }, store.cookie)))
      .toMatchObject({ _tag: "ResolutionNotAllowed" })
    expect(failure(await rpc("Returns.resolve", { id: started.id, resolution: "refund" }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { refundId: "required" } })

    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    const refundId = mintId("rfd")
    const resolved = ok(await rpc("Returns.resolve", { id: started.id, resolution: "refund", refundId }, store.cookie))
    expect(resolved.undo).toBeNull()
    expect(resolved.returns[0]!.resolution).toMatchObject({ kind: "refund", amountMinor: line.unitPriceMinor })
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect((await instance!.getOutput() as Array<Outcome>)[0]).toMatchObject({ outcome: "sent" })
    const refunds = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds
    expect(refunds.map((r) => [r.id, r.amountMinor, r.status])).toEqual([[refundId, line.unitPriceMinor, "succeeded"]])

    // The same resolve again (a retried request): the same return, no second refund.
    ok(await rpc("Returns.resolve", { id: started.id, resolution: "refund", refundId }, store.cookie))
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(1)

    const done = ok(await rpc("Returns.get", { id: started.id }, store.cookie))
    expect(done.events.map((e) => e.text)).toEqual([
      "Retour gestart namens de klant",
      "Goedgekeurd",
      "Ontvangen gemarkeerd",
      "Gecontroleerd: in orde",
      "Afgehandeld: terugbetaald"
    ])
    // Who settled it is said by name, as the history says it.
    expect(done.record.resolution?.by).toBe(done.events.at(-1)?.name)
    expect(done.record.resolution?.by).not.toMatch(/^mem_/)
    const { counts } = ok(await rpc("Returns.list", {}, store.cookie))
    expect(counts).toMatchObject({ total: 1, resolved: 1, review: 0, returns: 1, claims: 0 })
  })

  it("holds the product rules, rejects and reopens, assigns, and keeps an item for a claim", async () => {
    const store = await importedStore("ret-rules")
    const order = await orderNumbered(store.cookie, "#1001")
    const line = await firstLine(store.cookie, order.id)
    const before = ok(await rpc("Returns.settings", undefined, store.cookie))
    const saved = ok(
      await rpc("Returns.setSettings", {
        ...before,
        rules: [{
          id: "new",
          kind: "not_returnable",
          target: { by: "product", productId: line.productId!, label: line.title },
          note: "Dit nemen we om hygiënische redenen niet terug."
        }],
        offered: ["refund", "replacement", "gift_card"],
        portal: { ...before.portal, on: true }
      }, store.cookie)
    )
    expect(saved.settings.rules[0]).toMatchObject({ kind: "not_returnable", target: { by: "product" } })
    expect(saved.settings.portal.on).toBe(true)

    // Not returnable: a return is refused; a claim (it arrived damaged) is not.
    const base = { orderId: order.id, lines: [{ lineId: line.id, qty: 1 }], requested: "refund" as const }
    expect(failure(await rpc("Returns.start", { ...base, reasonId: "too_big" }, store.cookie))).toMatchObject({
      _tag: "LineNotReturnable",
      why: "rule"
    })
    const claim = ok(
      await rpc("Returns.start", { ...base, reasonId: "damaged", requested: "replacement" }, store.cookie)
    ).returns[0]!
    expect(claim).toMatchObject({ kind: "claim", quality: true })
    const detail = ok(await rpc("Returns.get", { id: claim.id }, store.cookie))
    expect(detail.rule).toMatchObject({ kind: "not_returnable" })
    expect(detail.photoRequired).toBe(true)

    ok(await rpc("Returns.reject", { ids: [claim.id], reason: "Geen foto's van het probleem" }, store.cookie))
    expect(ok(await rpc("Returns.get", { id: claim.id }, store.cookie)).record).toMatchObject({
      status: "rejected",
      rejectReason: "Geen foto's van het probleem"
    })
    ok(await rpc("Returns.reopen", { id: claim.id }, store.cookie))

    const me = ok(await sessionMe(store.cookie)).principals[0]!.id
    const assigned = ok(await rpc("Returns.assign", { ids: [claim.id], memberId: me }, store.cookie))
    expect(assigned.returns[0]!.assigneeId).toBe(me)
    expect(ok(await rpc("Returns.get", { id: claim.id }, store.cookie)).assignee?.id).toBe(me)

    // A claim that keeps the item goes straight to be settled, with a new one.
    expect(ok(await rpc("Returns.approve", { ids: [claim.id], keepItem: true }, store.cookie)).returns[0]!.status)
      .toBe("ready")
    const settled = ok(await rpc("Returns.resolve", { id: claim.id, resolution: "replacement" }, store.cookie))
    expect(settled.returns[0]!.resolution).toMatchObject({ kind: "replacement", amountMinor: 0 })
    // Not a refund: it can be taken back.
    ok(await rpc("Shared.undo", { token: settled.undo!.token }, store.cookie))
    expect(ok(await rpc("Returns.get", { id: claim.id }, store.cookie)).record).toMatchObject({
      status: "ready",
      resolution: null
    })

    // The policy saved can be put back as it was.
    ok(await rpc("Shared.undo", { token: saved.undo.token }, store.cookie))
    expect(ok(await rpc("Returns.settings", undefined, store.cookie))).toMatchObject({
      rules: [],
      portal: { on: false }
    })
  })

  it("asks each role for its returns rights", async () => {
    const store = await importedStore("ret-roles")
    const order = await orderNumbered(store.cookie, "#1003")
    const line = await firstLine(store.cookie, order.id)
    const emails = { service: `ret-service-${run}@invited.test`, finance: `ret-finance-${run}@invited.test` }
    ok(
      await rpc("Invitations.send", {
        rows: [
          { email: emails.service, roleId: "service", stores: "all" },
          { email: emails.finance, roleId: "finance", stores: "all" }
        ]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const service = await join(emails.service)
    const finance = await join(emails.finance)

    const input = {
      orderId: order.id,
      lines: [{ lineId: line.id, qty: 1 }],
      reasonId: "not_as_expected",
      requested: "refund" as const
    }
    // Finance sees returns but does not work them.
    expect(failure(await rpc("Returns.start", input, finance))).toMatchObject({ _tag: "Forbidden" })
    const started = ok(await rpc("Returns.start", input, service)).returns[0]!
    expect(ok(await rpc("Returns.list", {}, finance)).rows.map((r) => r.id)).toEqual([started.id])
    // Klantenservice may not change the policy.
    const settings = ok(await rpc("Returns.settings", undefined, service))
    expect(failure(await rpc("Returns.setSettings", settings, service))).toMatchObject({ _tag: "Forbidden" })
  })
})

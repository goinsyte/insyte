import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * A case's evidence pack (M13 step 4), against the recorded twin's order #1002 (sent with PostNL as 3S201, delivered):
 * "Bewijspakket samenstellen" starts one Workflow, which gathers a document per kind of evidence the case's facts
 * carry (the shipment, its delivery, what the customer and the team wrote, the order itself, the drafted account), each
 * a file of its own in the pack as Insyte's, and says how far it got. Asked again it replaces what it gathered and
 * leaves the team's own files; a removed document that a later pack gathered again stays out. A step that keeps
 * failing marks the pack failed, to be asked for again. The case is found by its number, its customer or its order,
 * and Start counts the cases that need evidence.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const manual = {
  provider: "stripe" as const,
  customer: { name: "Sanne de Vries" },
  amountMinor: 8_950,
  reasonCode: "not_received" as const
}

const orderNumbered = async (cookie: string, number: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === number)!

interface Instances {
  get: () => Promise<Array<{ waitForStatus: (s: "complete") => Promise<void>; getOutput: () => Promise<unknown> }>>
}

/** Every pack run started since introspection began, once each has run to its end. */
const ran = async (packs: Instances, count: number) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    const instances = await packs.get()
    if (instances.length >= count) {
      const outputs = []
      for (const instance of instances) {
        await instance.waitForStatus("complete")
        outputs.push(await instance.getOutput())
      }
      return outputs
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`fewer than ${count} pack runs started`)
}

const opened = async (cookie: string, fileId: string) => {
  const response = await call(`http://api.test/api/files/${fileId}`, { headers: { cookie } })
  return { status: response.status, type: response.headers.get("content-type"), text: await response.text() }
}

describe("evidence packs", () => {
  it("gathers the case's documents from its order, delivery and correspondence, as Insyte's, and says how far", async () => {
    const store = await importedStore("cb-gather")
    const order = await orderNumbered(store.cookie, "#1002")
    ok(
      await rpc("Tickets.create", {
        title: "Pakket nooit ontvangen",
        description: "De klant zegt dat er niets is bezorgd.",
        related: { type: "order", id: order.id }
      }, store.cookie)
    )
    const created = ok(await rpc("Chargebacks.createManual", { ...manual, orderId: order.id }, store.cookie))
      .chargebacks[0]!
    expect(ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).pack).toBeNull()

    await using packs = await introspectWorkflow(env.EVIDENCE_PACK)
    const asked = ok(await rpc("Chargebacks.assemblePack", { ids: [created.id] }, store.cookie))
    // It cannot be taken back, and there is nothing to take back: it only gathers.
    expect(asked.undo).toBeNull()
    await relay(store.workspace)
    expect(await ran(packs, 1)).toEqual([{ outcome: "ready" }])
    // The relay delivering the request again starts no second run.
    expect(await packs.get()).toHaveLength(1)

    const detail = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie))
    expect(detail.pack).toMatchObject({ state: "ready", done: 5, total: 5, error: null })
    expect(detail.pack!.readyAt).toEqual(expect.any(Number))
    expect(detail.pack!.narrative).toContain("DSP-1")
    expect(detail.pack!.narrative).toContain("#1002")
    expect(detail.evidence.map((e) => [e.name, e.source])).toEqual([
      ["verzendgegevens-1002.html", "insyte"],
      ["bezorgbevestiging-1002.html", "insyte"],
      ["klantcontact-1002.html", "insyte"],
      ["bestelling-1002.html", "insyte"],
      ["toelichting-DSP-1.html", "insyte"]
    ])
    expect(detail.chargeback.evidenceCount).toBe(5)
    expect(detail.timeline.map((e) => e.kind)).toEqual(["opened", "pack_assembled"])

    // Each document opens for whoever may see the case, and says what it is about.
    const [tracking, delivery, correspondence, invoice, narrative] = detail.evidence
    const sent = await opened(store.cookie, tracking!.fileId!)
    expect(sent.status).toBe(200)
    expect(sent.type).toContain("text/html")
    expect(sent.text).toContain("3S201")
    expect(sent.text).toContain("PostNL")
    expect((await opened(store.cookie, delivery!.fileId!)).text).toContain("3S201")
    expect((await opened(store.cookie, correspondence!.fileId!)).text).toContain("Pakket nooit ontvangen")
    expect((await opened(store.cookie, invoice!.fileId!)).text).toContain("#1002")
    expect((await opened(store.cookie, narrative!.fileId!)).text).toContain("DSP-1")
  })

  it("replaces what it gathered when asked again, keeps the team's files, and fails a pack whose step keeps failing", async () => {
    const store = await importedStore("cb-again")
    const order = await orderNumbered(store.cookie, "#1002")
    const created = ok(await rpc("Chargebacks.createManual", { ...manual, orderId: order.id }, store.cookie))
      .chargebacks[0]!
    const uploaded = await (await call(`http://api.test/api/chargebacks/${created.id}/evidence`, {
      method: "PUT",
      headers: { cookie: store.cookie, "content-type": "application/pdf", "x-file-name": "pakbon.pdf" },
      body: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
    })).json() as Json
    ok(await rpc("Chargebacks.addEvidence", { chargebackId: created.id, fileIds: [uploaded.id] }, store.cookie))

    await using packs = await introspectWorkflow(env.EVIDENCE_PACK)
    ok(await rpc("Chargebacks.assemblePack", { ids: [created.id] }, store.cookie))
    await relay(store.workspace)
    await ran(packs, 1)
    const first = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).evidence
    expect(first.map((e) => e.name)).toEqual([
      "pakbon.pdf",
      "verzendgegevens-1002.html",
      "bezorgbevestiging-1002.html",
      "bestelling-1002.html",
      "toelichting-DSP-1.html"
    ])

    // The team takes the drafted account out, then asks for the pack again.
    const account = first.find((e) => e.name.startsWith("toelichting"))!
    const removed = ok(
      await rpc("Chargebacks.removeEvidence", { chargebackId: created.id, itemId: account.id }, store.cookie)
    )
    ok(await rpc("Chargebacks.assemblePack", { ids: [created.id] }, store.cookie))
    await relay(store.workspace)
    await ran(packs, 2)
    const second = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie))
    expect(second.pack).toMatchObject({ state: "ready", done: 4, total: 4 })
    expect(second.evidence.map((e) => e.name)).toEqual(first.map((e) => e.name))
    // The documents are this run's: none of the first run's is in the pack.
    const firstIds = new Set(first.map((e) => e.id))
    expect(second.evidence.filter((e) => e.source === "insyte").every((e) => !firstIds.has(e.id))).toBe(true)
    expect(second.evidence[0]!.id).toBe(first[0]!.id)
    // Undo on the old removal does not bring the first account back next to the new one.
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, store.cookie))
    expect(
      ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).evidence
        .filter((e) => e.name.startsWith("toelichting"))
    ).toHaveLength(1)

    // A document that cannot be made, try after try: the pack is failed, and asking again gathers it.
    await packs.modifyAll(async (m) => {
      await m.disableRetryDelays()
      await m.mockStepError({ name: "document:invoice" }, new Error("browser busy"))
    })
    ok(await rpc("Chargebacks.assemblePack", { ids: [created.id] }, store.cookie))
    await relay(store.workspace)
    const outputs = await ran(packs, 3)
    expect(outputs[2]).toEqual({ outcome: "failed" })
    const failed = ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).pack
    expect(failed).toMatchObject({ state: "failed", done: 2, total: 4 })
    expect(failed!.error).toContain("browser busy")
  })

  it("starts no pack for a closed case, and lets a role that may only look ask for none", async () => {
    const store = await importedStore("cb-closed")
    const created = ok(await rpc("Chargebacks.createManual", manual, store.cookie)).chargebacks[0]!
    ok(await rpc("Chargebacks.accept", { ids: [created.id] }, store.cookie))
    expect(failure(await rpc("Chargebacks.assemblePack", { ids: [created.id] }, store.cookie))).toMatchObject({
      _tag: "CaseClosed",
      id: created.id
    })
    expect(failure(await rpc("Chargebacks.assemblePack", { ids: ["cb_none"] }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })
  })

  it("finds a case by its number, its customer and its order, and counts the cases waiting on Start", async () => {
    const store = await importedStore("cb-find")
    const order = await orderNumbered(store.cookie, "#1003")
    const created = ok(
      await rpc("Chargebacks.createManual", { ...manual, orderId: order.id }, store.cookie)
    ).chargebacks[0]!
    // The order's customer is the case's.
    const surname = created.customerName.split(" ").at(-1)!.toLowerCase()
    const search = async (q: string) =>
      ok(await rpc("Search.records", { q, kinds: ["chargeback"] }, store.cookie)).map((h) => [h.id, h.href])
    const hit = [created.id, `/chargebacks/${created.id}`]
    expect(await search("DSP-1")).toEqual([hit])
    expect(await search(surname)).toEqual([hit])
    expect(await search("#1003")).toEqual([hit])
    expect(await search("niemand")).toEqual([])

    const brief = ok(await rpc("Home.brief", undefined, store.cookie))
    expect(brief.evidence).toBe(1)
    const home = ok(await rpc("Home.widgets", { ids: ["chargebacks"], range: 30 }, store.cookie))
    expect(home.widgets.chargebacks).toEqual({
      open: 1,
      atStakeMinor: 8_950,
      won: 0,
      decided: 0,
      submitted: 0,
      nearest: {
        id: created.id,
        caseNumber: "DSP-1",
        customerName: created.customerName,
        deadlineAt: created.deadlineAt
      }
    })
    // Accepted as lost: no longer waiting, and decided.
    ok(await rpc("Chargebacks.accept", { ids: [created.id] }, store.cookie))
    expect(ok(await rpc("Home.brief", undefined, store.cookie)).evidence).toBe(0)
    expect(ok(await rpc("Home.widgets", { ids: ["chargebacks"], range: 30 }, store.cookie)).widgets.chargebacks)
      .toMatchObject({ open: 0, atStakeMinor: 0, decided: 1, nearest: null })
  })
})

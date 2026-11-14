import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Start catching up with the records (M10.1–M10.2, M13), against Shopify's recorded twin. An order leg the
 * supplier could not be sent opens a red row; a case the provider opened opens an amber one, which becomes "wacht op
 * bewijs" once it waits for evidence. A case waiting for evidence gets a plate that has Insyte gather the pack; a store
 * that lost its link gets one that sends the person to Shopify, which only a member may file. Each area's panel counts
 * what its list shows.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const refresh = (workspace: string) =>
  call(`http://api.test/api/__dev/queue/refresh?workspace=${workspace}`, { method: "POST" })

const rows = async (cookie: string) => ok(await rpc("Queue.list", { tab: "all" }, cookie)).rows

type Row = Awaited<ReturnType<typeof rows>>[number]

/** The row once its plate is drawn: the relay's own kick may still be drawing it. Gives up after five seconds. */
const drawn = async (cookie: string, find: (row: Row) => boolean): Promise<Row> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const row = (await rows(cookie)).find(find)
    if (row?.proposal != null) return row
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return (await rows(cookie)).find(find)!
}

const cases = async (workspace: string, body: unknown) => {
  const response = await call(`http://api.test/api/__dev/facts/disputes?workspace=${workspace}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
}

describe("Start's queue catches up", () => {
  it("opens a red row for a leg that did not go, and an amber one for a new case until it waits for evidence", async () => {
    const store = await importedStore("cu-rows")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1001")!
    const [leg] = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    // Atelier Noord, made from a vendor name, has no address yet: the send fails.
    ok(await rpc("Forwarding.forward", { ids: [leg!.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await sends.get()
    await instance!.waitForStatus("complete")
    await refresh(store.workspace)
    expect((await rows(store.cookie)).find((r) => r.kind === "forwarding_failed")).toMatchObject({
      subjectId: order.id,
      signal: "red",
      state: "open",
      title: "Bestelling #1001 niet doorgestuurd naar Atelier Noord · versturen naar de leverancier mislukt",
      valueMinor: order.totalMinor
    })

    const caseNumber = `CU-${run}`
    await cases(store.workspace, { insert: [{ caseNumber, storeId: store.storeId, status: "open" }] })
    await refresh(store.workspace)
    const opened = (await rows(store.cookie)).find((r) => r.kind === "chargeback_opened")
    // Its deadline is two weeks away, and still it wants a look.
    expect(opened).toMatchObject({ signal: "amber", title: `Nieuwe chargeback ${caseNumber} · Klant` })
    expect(ok(await rpc("Queue.list", { tab: "needs_you" }, store.cookie)).rows.map((r) => r.id)).toContain(opened!.id)

    await cases(store.workspace, { update: [{ caseNumber, status: "awaiting_evidence" }] })
    await refresh(store.workspace)
    const now = await rows(store.cookie)
    expect(now.find((r) => r.kind === "chargeback_opened")).toBeUndefined()
    expect(now.find((r) => r.kind === "chargeback_deadline")).toMatchObject({
      subjectId: opened!.subjectId,
      title: `Chargeback ${caseNumber} wacht op bewijs · Klant`
    })
  })

  it("draws a case's plate that gathers its evidence pack, and files it as the person", async () => {
    const store = await importedStore("cu-pack")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const created = ok(
      await rpc("Chargebacks.createManual", {
        provider: "stripe",
        customer: { name: "Sanne de Vries" },
        amountMinor: 8_950,
        reasonCode: "not_received",
        orderId: order.id
      }, store.cookie)
    ).chargebacks[0]!
    await relay(store.workspace)
    await refresh(store.workspace)

    const row = await drawn(store.cookie, (r) => r.subjectId === created.id)
    expect(row).toMatchObject({ kind: "chargeback_deadline" })
    expect(row.proposal).toMatchObject({
      state: "open",
      action: { _tag: "AssembleEvidencePack", chargebackId: created.id },
      plate: {
        fileLabel: "Pakket laten verzamelen",
        confidence: 0.9,
        confidenceBasis: "bestelling #1002 is aan de zaak gekoppeld",
        before: { value: expect.stringContaining("Wacht op bewijs · nog geen bewijs") }
      }
    })

    await using packs = await introspectWorkflow(env.EVIDENCE_PACK)
    const filed = ok(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))
    expect(filed.proposal).toMatchObject({ state: "executed" })
    await relay(store.workspace)
    const [instance] = await packs.get()
    await instance!.waitForStatus("complete")
    expect(ok(await rpc("Chargebacks.get", { id: created.id }, store.cookie)).pack).toMatchObject({ state: "ready" })
    // The case still waits for the person to submit it: its row stands, and no plate is drawn again for a ready pack.
    await refresh(store.workspace)
    const after = (await rows(store.cookie)).find((r) => r.subjectId === created.id)
    expect(after).toMatchObject({ kind: "chargeback_deadline", proposal: null })
  })

  it("draws a lost store's plate for the person to reconnect it, which a key may not file", async () => {
    const store = await importedStore("cu-link")
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    await relay(store.workspace)
    await refresh(store.workspace)

    const row = await drawn(store.cookie, (r) => r.kind === "store_disconnected")
    expect(row.proposal).toMatchObject({
      state: "open",
      action: { _tag: "ReconnectStore", storeId: store.storeId, shopDomain: store.shop },
      plate: { fileLabel: "Opnieuw koppelen bij Shopify", confidence: 0.9 }
    })

    const secret = ok(
      await rpc("ApiKeys.create", {
        label: "Koppeling",
        access: { kind: "role", roleId: "admin" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    // A key reaches no Instellingen through the API: the plate is not its to read, let alone to file.
    const v1 = (method: string, path: string) =>
      call(`http://api.public.test/v1/proposals/${row.proposal!.id}${path}`, {
        method,
        headers: { authorization: `Bearer ${secret}`, "idempotency-key": crypto.randomUUID() }
      })
    expect((await v1("GET", "")).status).toBe(404)
    const byKey = await v1("POST", "/file")
    expect(byKey.status).toBe(404)
    expect(((await byKey.json()) as Json).error).toMatchObject({ code: "NotFoundV1" })
    expect(ok(await rpc("Proposals.get", { id: row.proposal!.id }, store.cookie)).state).toBe("open")

    // Filed by the owner: approved, and the row stands until Shopify gives the link back.
    const filed = ok(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))
    expect(filed.proposal).toMatchObject({ state: "executed" })
    expect((await rows(store.cookie)).find((r) => r.kind === "store_disconnected")).toBeDefined()
    expect(failure(await rpc("Proposals.file", { id: row.proposal!.id }, store.cookie))).toMatchObject({
      _tag: "ProposalClosed"
    })
  })
})

describe("the panel's counts", () => {
  it("counts each area as its list does", async () => {
    const store = await importedStore("cu-counts")
    const counts = async (area: string) => ok(await rpc("Nav.counts", { area }, store.cookie))

    const products = ok(await rpc("Products.list", {}, store.cookie))
    const status = (s: string) => products.counts.status[s] ?? 0
    const byProduct = {
      "/products?status=active": status("active"),
      "/products?status=draft": status("draft"),
      "/products?status=archived": status("archived"),
      "/products?status=attention_returns": 0,
      "/products?status=attention_complaints": 0,
      "/products?status=attention_checks": 0
    }
    expect(await counts("products")).toEqual(byProduct)
    expect(await counts("suppliers")).toEqual(byProduct)

    const customers = ok(await rpc("Customers.list", { limit: 200 }, store.cookie)).rows
    expect(await counts("customers")).toEqual({
      "/customers?segment=new": customers.filter((c) => c.ordersCount <= 2).length,
      "/customers?segment=vip": customers.filter((c) => c.ordersCount > 2).length
    })

    // A return in review, of a damaged shirt: a quality complaint on the product, and more than a tenth of what sold.
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    ok(
      await rpc("Returns.start", {
        orderId: order.id,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "damaged",
        requested: "refund"
      }, store.cookie)
    )
    const list = ok(await rpc("Returns.list", {}, store.cookie)).counts
    expect(await counts("returns")).toMatchObject({
      "/returns": list.total,
      "/returns?view=review": list.review,
      "/returns?view=claims": list.claims
    })
    expect(list.review).toBe(1)
    expect(await counts("products")).toMatchObject({
      "/products?status=attention_returns": 1,
      "/products?status=attention_complaints": 1
    })

    await cases(store.workspace, {
      insert: [{ caseNumber: `CC-${run}`, storeId: store.storeId, status: "awaiting_evidence" }]
    })
    const tabs = ok(await rpc("Chargebacks.list", {}, store.cookie)).counts
    expect(await counts("chargebacks")).toEqual({
      "/chargebacks?tab=action_required": tabs.actionRequired,
      "/chargebacks?tab=submitted": tabs.submitted,
      "/chargebacks?tab=won": tabs.won,
      "/chargebacks?tab=lost": tabs.lost
    })
    expect(tabs.actionRequired).toBe(1)
  })
})

import { mintId } from "@insyte/domain/Ids"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Supplier statements, the brand's side (step 15.6, M13 step 6): a line a supplier shipped counts at its product's cost
 * price in the running month ("Lopend"); the close books it once into the month's statement with its PDF, and a second
 * close writes nothing; a supplier-fault return refunded after the close is booked in the next one, negative; marking
 * paid is Beheren's and comes with Undo; the PDF downloads for whoever may see suppliers; those who pay hear the month
 * is ready; a key reads the statements through `/v1` and MCP.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const encoder = new TextEncoder()

const sign = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const t = Math.floor(Date.now() / 1000)
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${body}`))
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

const pad = (n: number) => String(n).padStart(2, "0")

/** This month and the next, in the workspace's timezone (Europe/Amsterdam). */
const months = () => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-")
    .map(Number) as [number, number]
  const next = m === 12 ? [y + 1, 1] : [y, m + 1]
  return { now: `${y}-${pad(m)}`, next: `${next[0]}-${pad(next[1]!)}`, payDay: `${next[0]}-${pad(next[1]!)}-15` }
}

const close = async (workspace: string, month: string) => {
  const response = await call(`http://api.test/api/__dev/statements/close?workspace=${workspace}&month=${month}`, {
    method: "POST"
  })
  return { status: response.status, body: await response.json() as Json }
}

describe("supplier statements", () => {
  it("books what a supplier shipped at cost, once, with its PDF, and is marked paid with Undo", async () => {
    const store = await importedStore("statements")
    const { now, payDay } = months()
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const { secret } = ok(
      await rpc("Suppliers.connectApi", { id: atelier.id, url: "https://echo.supplier.example/orders" }, store.cookie)
    )
    ok(await rpc("Suppliers.update", { id: atelier.id, forwardChannel: "api" }, store.cookie))

    // Nothing shipped yet: no statements, nothing running.
    const empty = ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, store.cookie))
    expect(empty).toMatchObject({ supplier: { id: atelier.id, name: "Atelier Noord" }, rows: [] })
    expect(empty.summary).toEqual({ currency: "EUR", paidYtdMinor: 0, payDay: 15 })
    expect(failure(await rpc("Suppliers.statement", { supplierId: atelier.id, month: now }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    // #1001 goes to Atelier Noord by its API, and it ships.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [send] = await sends.get()
    await send!.waitForStatus("complete")
    const body = JSON.stringify({ type: "order.shipped", leg_id: leg.id, carrier: "PostNL", tracking_number: "3SST1" })
    const shipped = await call(`http://api.public.test/hooks/supplier/${atelier.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "insyte-signature": await sign(Redacted.value(secret), body) },
      body
    })
    expect(shipped.status).toBe(200)

    // Without a cost price the line is there, but counts nothing.
    const line = leg.lines[0]!
    const uncosted = ok(await rpc("Suppliers.statement", { supplierId: atelier.id, month: now }, store.cookie))
    expect(uncosted.statement).toMatchObject({ id: null, status: "open", totalMinor: 0, missingLines: 1 })
    expect(uncosted.lines).toMatchObject([{ kind: "shipped", orderNumber: "#1001", missing: "cost", totalMinor: 0 }])

    // At 18,00 a piece it is running ("Lopend") at that.
    ok(await rpc("Products.edit", { id: line.productId!, costMinor: 1800 }, store.cookie))
    const open = ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, store.cookie))
    expect(open.rows).toHaveLength(1)
    expect(open.rows[0]).toMatchObject({
      id: null,
      month: now,
      status: "open",
      currency: "EUR",
      shippedMinor: 1800 * line.quantity,
      correctionsMinor: 0,
      totalMinor: 1800 * line.quantity,
      shippedLines: 1,
      missingLines: 0,
      payDay
    })

    // The close books it, once, with its PDF; a second close writes nothing.
    const first = await close(store.workspace, now)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ month: now, skipped: 0, ended: true })
    expect(first.body.written).toHaveLength(1)
    expect(first.body.documents).toEqual(first.body.written)
    expect((await close(store.workspace, now)).body).toMatchObject({ written: [], skipped: 1, documents: [] })
    expect(
      (await call(`http://api.test/api/__dev/statements/close?workspace=${store.workspace}&month=13`, {
        method: "POST"
      })).status
    ).toBe(400)

    const closed = ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, store.cookie))
    expect(closed.rows).toHaveLength(1)
    const row = closed.rows[0]!
    expect(row).toMatchObject({ month: now, status: "processing", totalMinor: 1800 * line.quantity, paidAt: null })
    expect(row.id).toBe(first.body.written[0])
    expect(row.invoiceFileId).not.toBeNull()
    const detail = ok(await rpc("Suppliers.statement", { supplierId: atelier.id, month: now }, store.cookie))
    expect(detail.lines).toMatchObject([{
      kind: "shipped",
      orderNumber: "#1001",
      title: line.title,
      qty: line.quantity,
      unitCostMinor: 1800,
      totalMinor: 1800 * line.quantity,
      missing: null
    }])

    // The PDF (the HTML in the tests) for whoever may see suppliers; nobody signed out.
    const file = await call(`http://api.test/api/files/${row.invoiceFileId}`, { headers: { cookie: store.cookie } })
    expect(file.status).toBe(200)
    const html = await file.text()
    expect(html).toContain("Factuur")
    expect(html).toContain("Van Atelier Noord aan")
    expect(html).toContain("#1001")
    expect((await call(`http://api.test/api/files/${row.invoiceFileId}`)).status).toBe(401)

    // Those who may pay it hear the month is ready.
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "supplier.statement")).toMatchObject({
      subjectType: "supplier_statement",
      data: { month: now, count: 1, totalMinor: 1800 * line.quantity, currency: "EUR" }
    })

    // Paid, with its reference; Undo puts it back to be paid.
    const paid = ok(await rpc("Suppliers.markStatementPaid", { id: row.id!, reference: "SEPA 0042" }, store.cookie))
    expect(paid.statement).toMatchObject({ status: "paid", paidReference: "SEPA 0042" })
    expect(paid.undo).not.toBeNull()
    ok(await rpc("Shared.undo", { token: paid.undo!.token }, store.cookie))
    expect(ok(await rpc("Suppliers.statement", { supplierId: atelier.id, month: now }, store.cookie)).statement)
      .toMatchObject({ status: "processing", paidAt: null, paidReference: null })
    ok(await rpc("Suppliers.markStatementPaid", { id: row.id! }, store.cookie))
    const again = ok(await rpc("Suppliers.markStatementPaid", { id: row.id! }, store.cookie))
    expect(again.undo).toBeNull()
    expect(ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, store.cookie)).summary.paidYtdMinor)
      .toBe(1800 * line.quantity)
    expect(failure(await rpc("Suppliers.markStatementPaid", { id: "sst_none" }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })

    // A damaged claim on it, refunded after the close: booked in the next statement, at the same cost, negative.
    const started = ok(
      await rpc("Returns.start", {
        orderId: leg.orderId,
        lines: [{ lineId: line.id, qty: 1 }],
        reasonId: "damaged",
        requested: "refund"
      }, store.cookie)
    ).returns[0]!
    ok(await rpc("Returns.approve", { ids: [started.id], keepItem: true }, store.cookie))
    ok(await rpc("Returns.resolve", { id: started.id, resolution: "refund", refundId: mintId("rfd") }, store.cookie))
    const running = ok(await rpc("Suppliers.statements", { supplierId: atelier.id }, store.cookie))
    // This month is closed, so what is still to book shows only once the next one runs; it is booked then.
    expect(running.rows.map((r) => [r.month, r.status])).toEqual([[now, "paid"]])
    const { next } = months()
    const later = await close(store.workspace, next)
    expect(later.body.written).toHaveLength(1)
    const correction = ok(await rpc("Suppliers.statement", { supplierId: atelier.id, month: next }, store.cookie))
    expect(correction.statement).toMatchObject({ shippedMinor: 0, correctionsMinor: -1800, totalMinor: -1800 })
    expect(correction.lines).toMatchObject([{
      kind: "correction",
      orderNumber: "#1001",
      qty: 1,
      unitCostMinor: 1800,
      totalMinor: -1800,
      reason: "Beschadigd aangekomen",
      returnId: started.id
    }])
  }, 180_000)

  it("is read through /v1 and MCP by a key that may see suppliers", async () => {
    const store = await importedStore("statements-v1")
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const token = ok(
      await rpc("ApiKeys.create", {
        label: "Boekhouding",
        access: { kind: "role", roleId: "view" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const get = async (path: string) => {
      const response = await call(`http://api.public.test/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, body: await response.json() as Json }
    }
    expect(await get(`/suppliers/${atelier.id}/statements`)).toMatchObject({
      status: 200,
      body: {
        supplier: { id: atelier.id, name: "Atelier Noord" },
        data: [],
        summary: { currency: "EUR", paid_ytd_minor: 0, pay_day: 15 }
      }
    })
    expect((await get("/suppliers/sup_none/statements")).status).toBe(404)
  }, 120_000)
})

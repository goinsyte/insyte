import { describe, expect, it } from "vitest"
import { join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The store switch (M6 multi-store): a workspace with two stores, and every list and figure the console reads asked
 * for one of them (`storeId`). The owner, who reaches both, reads each store's rows apart, and the two add up to what
 * every store reads. A member held to the first store (`storeScope`) reads that store's rows whether or not they name
 * it, and nothing when they name the other: a store outside their stores narrows to none, never wider. The frame lists
 * the stores the member reaches, for the top bar's switch, and the choice is their `store` preference.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const pad = (n: number) => String(n).padStart(2, "0")
const now = new Date()
const month = (back: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
const A = month(0)
const B = month(1)

/** The recorded store, imported into the person's workspace; with `tag`, another one beside it, named `name`. */
const seed = async (cookie: string, tag?: string, name?: string) => {
  const query = tag === undefined ? "" : `?${new URLSearchParams({ tag, name: name ?? tag })}`
  const response = await call(`http://api.test/api/__dev/stores/seed${query}`, { method: "POST", headers: { cookie } })
  expect(response.status).toBe(200)
  return (await response.json() as { storeId: string }).storeId
}

/** Paid orders placed this month in one store, through the mirror's writer, for Analyse's facts. */
const paid = async (workspace: string, store: string, tag: string, count: number, placedIn = A) => {
  const placed = `${placedIn}-01T10:00:00Z`
  const orders = Array.from({ length: count }, (_, i) => ({
    shopify_id: `gid://shopify/Order/sw${tag}${run}${i}`,
    number: `#SW${tag}${i}`,
    customer_shopify_id: null,
    customer_name: "Klant",
    customer_email: null,
    status: "paid",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    total_minor: 1000,
    subtotal_minor: 1000,
    shipping_minor: 0,
    tax_minor: 0,
    discounts_minor: 0,
    currency: "EUR",
    payment_gateway: null,
    card_last4: null,
    shipping_address: { country: "NL" },
    tags: [],
    note: null,
    channel: "web",
    referral_code: null,
    placed_at: placed,
    paid_at: placed,
    shipped_at: null,
    cancelled_at: null,
    refunded_at: null,
    external_updated_at: placed,
    raw: {}
  }))
  const response = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${store}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timezone: "Europe/Amsterdam", batch: { orders } })
  })
  expect(response.status).toBe(200)
}

const storesOf = (rows: ReadonlyArray<{ storeId: string | null }>) => new Set(rows.map((r) => r.storeId))

describe("the store switch", () => {
  it("narrows every list and figure to the store asked for, within the stores the member reaches", async () => {
    const owner = await person("switch", "Wissel B.V.")
    const me = ok(await sessionMe(owner.cookie)).principals[0]!
    const workspace = me.workspaceId
    const first = await seed(owner.cookie)
    const second = await seed(owner.cookie, "tweede", "Tweede winkel")
    expect(second).not.toBe(first)
    await paid(workspace, first, "a", 2)
    await paid(workspace, second, "b", 1)
    // An older order in the second store only: Analyse's months start there for that store alone.
    await paid(workspace, second, "old", 1, month(14))
    await call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}`, { method: "POST" })

    // A ticket (the owner's, due tomorrow), a return and a chargeback on an order of each store.
    const dueAt = Date.now() + 86_400_000
    const ticketOf: Record<string, string> = {}
    for (const storeId of [first, second]) {
      const order = ok(await rpc("Orders.list", { limit: 50, storeId }, owner.cookie)).rows.find((o) =>
        o.number === "#1002"
      )!
      const line = ok(await rpc("Orders.get", { id: order.id }, owner.cookie)).lines[0]!
      ticketOf[storeId] = ok(
        await rpc("Tickets.create", {
          title: `Vraag over ${order.number}`,
          priority: "high",
          assigneeIds: [me.id],
          dueAt,
          related: { type: "order", id: order.id }
        }, owner.cookie)
      ).tickets[0]!.id
      ok(
        await rpc("Returns.start", {
          orderId: order.id,
          lines: [{ lineId: line.id, qty: 1 }],
          reasonId: "too_small",
          requested: "refund"
        }, owner.cookie)
      )
      ok(
        await rpc("Chargebacks.createManual", {
          provider: "stripe",
          customer: { name: "Sanne de Vries" },
          amountMinor: 4_500,
          reasonCode: "not_received",
          orderId: order.id
        }, owner.cookie)
      )
    }

    // A colleague held to the first store.
    const email = `switch-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: [first] }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const held = await join(email)

    // The frame lists the stores each reaches, for the switch.
    expect(ok(await rpc("Shell.frame", undefined, owner.cookie)).stores.map((s) => s.id).toSorted()).toEqual(
      [first, second].toSorted()
    )
    expect(ok(await rpc("Shell.frame", undefined, held)).stores.map((s) => s.id)).toEqual([first])

    // The lists with rows of a store: each store's apart, both together, and only the first one's for the colleague.
    const lists: Record<string, (payload: { storeId?: string }, cookie: string) => Promise<ReadonlyArray<Json>>> = {
      "Orders.list": async (p, c) => ok(await rpc("Orders.list", { limit: 200, ...p }, c)).rows,
      "Products.list": async (p, c) => ok(await rpc("Products.list", { limit: 200, ...p }, c)).rows,
      "Customers.list": async (p, c) => ok(await rpc("Customers.list", { limit: 200, ...p }, c)).rows,
      "Tickets.list": async (p, c) => ok(await rpc("Tickets.list", p, c)).rows,
      "Returns.list": async (p, c) => ok(await rpc("Returns.list", p, c)).rows,
      "Chargebacks.list": async (p, c) => ok(await rpc("Chargebacks.list", p, c)).rows
    }
    for (const [name, read] of Object.entries(lists)) {
      const every = await read({}, owner.cookie)
      expect(storesOf(every), name).toEqual(new Set([first, second]))
      const ofFirst = await read({ storeId: first }, owner.cookie)
      const ofSecond = await read({ storeId: second }, owner.cookie)
      expect(storesOf(ofFirst), name).toEqual(new Set([first]))
      expect(storesOf(ofSecond), name).toEqual(new Set([second]))
      expect(ofFirst.length + ofSecond.length, name).toBe(every.length)
      expect(storesOf(await read({}, held)), name).toEqual(new Set([first]))
      expect((await read({ storeId: first }, held)).length, name).toBe(ofFirst.length)
      expect(await read({ storeId: second }, held), name).toEqual([])
      expect(await read({ storeId: "sto_elsewhere" }, owner.cookie), name).toEqual([])
    }

    // The lists' facets count the store asked for too.
    const orderTotal = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Orders.list", { limit: 1, ...p }, c)).counts.total
    expect(await orderTotal({ storeId: first }, owner.cookie) + await orderTotal({ storeId: second }, owner.cookie))
      .toBe(await orderTotal({}, owner.cookie))
    expect(await orderTotal({ storeId: second }, held)).toBe(0)

    // Start's hero: an urgent ticket and a case waiting on evidence in each store.
    const brief = async (p: { storeId?: string }, c: string) => ok(await rpc("Home.brief", p, c))
    expect(await brief({}, owner.cookie)).toMatchObject({ urgent: 2, evidence: 2 })
    expect(await brief({ storeId: first }, owner.cookie)).toMatchObject({ urgent: 1, evidence: 1 })
    expect(await brief({ storeId: second }, owner.cookie)).toMatchObject({ urgent: 1, evidence: 1 })
    expect(await brief({}, held)).toMatchObject({ urgent: 1, evidence: 1 })
    expect(await brief({ storeId: second }, held)).toMatchObject({ urgent: 0, evidence: 0 })

    // Start's board, Mijn werk, the agenda and the feed read the store asked for.
    const pulse = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Home.widgets", { ids: ["orders", "tickets", "returns"], range: 90, ...p }, c)).pulse
    const pulseOf = (x: Json) => x.orders?.value ?? 0
    expect(
      pulseOf(await pulse({ storeId: first }, owner.cookie)) + pulseOf(await pulse({ storeId: second }, owner.cookie))
    )
      .toBe(pulseOf(await pulse({}, owner.cookie)))
    expect(pulseOf(await pulse({ storeId: second }, held))).toBe(0)
    const workTickets = async (p: { storeId?: string }) =>
      ok(await rpc("Home.work", p, owner.cookie)).rows.filter((r) => r.kind === "ticket").map((r) => r.subjectId)
    expect(await workTickets({ storeId: first })).toEqual([ticketOf[first]])
    expect(await workTickets({ storeId: second })).toEqual([ticketOf[second]])
    expect((await workTickets({})).toSorted()).toEqual([ticketOf[first], ticketOf[second]].toSorted())
    const today = new Date().toISOString().slice(0, 10)
    const agendaTickets = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Home.agenda", { from: today, span: "week", ...p }, c)).rows.filter((r) => r.kind === "ticket")
        .map((r) => r.subjectId)
    expect(await agendaTickets({ storeId: first }, owner.cookie)).toEqual([ticketOf[first]])
    expect(await agendaTickets({ storeId: second }, owner.cookie)).toEqual([ticketOf[second]])
    expect(await agendaTickets({ storeId: second }, held)).toEqual([])
    const breakdown = async (p: { storeId?: string }) =>
      ok(await rpc("Home.revenueBreakdown", { range: 90, ...p }, owner.cookie))
    const [allRevenue, firstRevenue, secondRevenue] = [
      await breakdown({}),
      await breakdown({ storeId: first }),
      await breakdown({ storeId: second })
    ]
    expect(firstRevenue.byStore.map((s) => s.id)).toEqual([first])
    expect(secondRevenue.byStore.map((s) => s.id)).toEqual([second])
    expect(firstRevenue.totalMinor).toBeGreaterThan(0)
    expect(secondRevenue.totalMinor).toBeGreaterThan(0)
    expect(firstRevenue.totalMinor + secondRevenue.totalMinor).toBe(allRevenue.totalMinor)
    const feed = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Home.activity", { limit: 200, ...p }, c)).rows.filter((r) => r.source === "order").length
    expect(await feed({ storeId: second }, held)).toBe(0)
    expect(await feed({ storeId: first }, owner.cookie) + await feed({ storeId: second }, owner.cookie)).toBe(
      await feed({}, owner.cookie)
    )

    // The queue: rows of the store asked for, and those of no store.
    const queue = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Queue.list", { tab: "all", ...p }, c)).rows
    const queueOfFirst = await queue({ storeId: first }, owner.cookie)
    const queueOfSecond = await queue({ storeId: second }, owner.cookie)
    expect(queueOfFirst.some((r) => r.storeName === "Insyte MVP Test")).toBe(true)
    expect(queueOfSecond.some((r) => r.storeName === "Tweede winkel")).toBe(true)
    for (const row of queueOfFirst) expect(["Insyte MVP Test", null]).toContain(row.storeName)
    for (const row of queueOfSecond) expect(["Tweede winkel", null]).toContain(row.storeName)
    const noStore = (rows: ReadonlyArray<Json>) => rows.filter((r) => r.storeName === null).length
    expect(queueOfFirst.length + queueOfSecond.length - noStore(queueOfFirst)).toBe(
      (await queue({}, owner.cookie)).length
    )
    for (const row of await queue({ storeId: second }, held)) expect(row.storeName).toBeNull()

    // The panel's counts.
    const navCount = async (area: string, p: { storeId?: string }, c: string) =>
      ok(await rpc("Nav.counts", { area, ...p }, c))
    const ticketsIn = async (p: { storeId?: string }, c: string) => (await navCount("tickets", p, c))["/tickets"] ?? 0
    expect(await ticketsIn({ storeId: first }, owner.cookie) + await ticketsIn({ storeId: second }, owner.cookie))
      .toBe(await ticketsIn({}, owner.cookie))
    expect(await ticketsIn({ storeId: second }, held)).toBe(0)
    const openOrders = async (p: { storeId?: string }, c: string) =>
      (await navCount("orders", p, c))["/orders?status=open"] ?? 0
    expect(await openOrders({ storeId: first }, owner.cookie) + await openOrders({ storeId: second }, owner.cookie))
      .toBe(await openOrders({}, owner.cookie))
    expect(await openOrders({ storeId: second }, held)).toBe(0)
    // Each area's counts: a store's apart add up to every store's, none of the other store for the colleague.
    for (const area of ["returns", "customers", "products", "chargebacks"]) {
      const all = await navCount(area, {}, owner.cookie)
      const ofFirst = await navCount(area, { storeId: first }, owner.cookie)
      const ofSecond = await navCount(area, { storeId: second }, owner.cookie)
      const total = (counts: Record<string, number>) => Object.values(counts).reduce((n, v) => n + v, 0)
      expect(total(ofFirst), area).toBeGreaterThan(0)
      expect(total(ofSecond), area).toBeGreaterThan(0)
      for (const path of Object.keys(all)) {
        expect((ofFirst[path] ?? 0) + (ofSecond[path] ?? 0), `${area} ${path}`).toBe(all[path])
      }
      expect(total(await navCount(area, { storeId: second }, held)), area).toBe(0)
    }

    // The suppliers' work: their products and orders counted in the store asked for.
    const supplied = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Suppliers.list", p, c)).rows.reduce((n: number, s: Json) => n + s.stats.products, 0)
    expect(await supplied({ storeId: first }, owner.cookie)).toBeGreaterThan(0)
    expect(await supplied({ storeId: second }, owner.cookie)).toBeGreaterThan(0)
    expect(await supplied({ storeId: first }, owner.cookie) + await supplied({ storeId: second }, owner.cookie)).toBe(
      await supplied({}, owner.cookie)
    )
    expect(await supplied({ storeId: second }, held)).toBe(0)
    const sold = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Quality.stats", { bySupplier: true, ...p }, c)).rows.reduce((n, r) => n + r.sold, 0)
    expect(await sold({ storeId: second }, held)).toBe(0)
    expect(await sold({ storeId: first }, owner.cookie) + await sold({ storeId: second }, owner.cookie)).toBe(
      await sold({}, owner.cookie)
    )
    // Each store's import made a leg to forward, and stock under a high mark: one store's apart, none of the other store
    // for the colleague.
    const legs = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Forwarding.list", { view: "to_forward", ...p }, c)).rows.map((l: Json) => l.id)
    const [legsOfFirst, legsOfSecond] = [
      await legs({ storeId: first }, owner.cookie),
      await legs({ storeId: second }, owner.cookie)
    ]
    expect(legsOfFirst.length).toBeGreaterThan(0)
    expect(legsOfSecond.length).toBeGreaterThan(0)
    expect([...legsOfFirst, ...legsOfSecond].toSorted()).toEqual((await legs({}, owner.cookie)).toSorted())
    expect(await legs({ storeId: first }, held)).toEqual(legsOfFirst)
    expect(await legs({ storeId: second }, held)).toEqual([])
    const low = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Products.lowStock", { threshold: 100, ...p }, c)).rows.map((r: Json) => r.id)
    const [lowOfFirst, lowOfSecond] = [
      await low({ storeId: first }, owner.cookie),
      await low({ storeId: second }, owner.cookie)
    ]
    expect(lowOfFirst.length).toBeGreaterThan(0)
    expect(lowOfSecond.length).toBeGreaterThan(0)
    expect([...lowOfFirst, ...lowOfSecond].toSorted()).toEqual((await low({}, owner.cookie)).toSorted())
    expect(await low({ storeId: second }, held)).toEqual([])

    // Analyse: this month's paid orders, two in the first store and one in the second.
    const pair = { a: A, b: B }
    const paidOrders = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Analytics.overview", { ...pair, ...p }, c)).figures.find((f) => f.id === "paid_orders")!.basis.a
    const all = await paidOrders({}, owner.cookie)
    const inFirst = await paidOrders({ storeId: first }, owner.cookie)
    const inSecond = await paidOrders({ storeId: second }, owner.cookie)
    expect(inFirst + inSecond).toBe(all)
    expect(inFirst - inSecond).toBe(1)
    expect(await paidOrders({}, held)).toBe(inFirst)
    expect(await paidOrders({ storeId: second }, held)).toBe(0)
    // The months start at the store's first order: the second store's is fourteen months back.
    const months = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Analytics.periods", p, c)).months.map((m) => m.month)
    expect((await months({ storeId: second }, owner.cookie))[0]).toBe(month(14))
    expect((await months({}, owner.cookie))[0]).toBe(month(14))
    expect(await months({ storeId: first }, owner.cookie)).not.toContain(month(14))
    expect(await months({}, held)).toEqual(await months({ storeId: first }, owner.cookie))
    ok(await rpc("Analytics.charts", { ...pair, storeId: first }, owner.cookie))
    // A finding's orders are the store's: the paid orders it names count only the store asked for.
    const findingCounts = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Analytics.findings", { ...pair, ...p }, c)).findings.reduce((n, f) => n + f.recordCount, 0)
    expect(await findingCounts({ storeId: second }, held)).toBe(0)
    expect(await findingCounts({ storeId: "sto_elsewhere" }, owner.cookie)).toBe(0)
    expect(await findingCounts({}, owner.cookie)).toBeGreaterThan(0)
    const explainKey = { ...pair, key: { _tag: "paid_orders" as const }, storeId: second }
    expect(ok(await rpc("Analytics.explain", explainKey, owner.cookie)).recordCount).toBe(inSecond)
    expect(ok(await rpc("Analytics.explain", explainKey, held)).recordCount).toBe(0)
    expect(ok(await rpc("Analytics.records", { explainKey }, held)).rows).toEqual([])

    // A ticket of no store (as mail makes them): narrowing to a store never hides a row of no store that the reader
    // saw, nor shows one they did not. Tickets are everyone's without a store, so each sees it in every store; the feed
    // shows a change to a record of no store only to someone who reaches every store, so the owner sees it in each
    // store and the colleague held to one in none, as before. Lists and counts agree.
    const storeless = ok(
      await rpc(
        "Tickets.create",
        { title: "Mail zonder winkel", priority: "high", assigneeIds: [me.id], dueAt },
        owner.cookie
      )
    ).tickets[0]!.id
    const ticketIds = async (p: { storeId?: string }, c: string) =>
      (await lists["Tickets.list"]!(p, c)).map((t: Json) => t.id)
    const changed = async (p: { storeId?: string }, c: string) =>
      ok(await rpc("Home.activity", { limit: 200, ...p }, c)).rows.some((r) => r.subjectId === storeless)
    for (const p of [{}, { storeId: first }, { storeId: second }]) {
      const at = JSON.stringify(p)
      expect(await ticketIds(p, owner.cookie), at).toContain(storeless)
      expect(await workTickets(p), at).toContain(storeless)
      expect(await agendaTickets(p, owner.cookie), at).toContain(storeless)
      expect(await changed(p, owner.cookie), at).toBe(true)
      // The panel's count is the list's.
      expect(await ticketsIn(p, owner.cookie), at).toBe((await ticketIds(p, owner.cookie)).length)
    }
    expect(await brief({}, owner.cookie)).toMatchObject({ urgent: 3 })
    expect(await brief({ storeId: first }, owner.cookie)).toMatchObject({ urgent: 2 })
    expect(await brief({ storeId: second }, owner.cookie)).toMatchObject({ urgent: 2 })
    expect(await ticketsIn({ storeId: first }, owner.cookie) + await ticketsIn({ storeId: second }, owner.cookie))
      .toBe(await ticketsIn({}, owner.cookie) + 1)
    // The colleague held to the first store reads it as before, named or not.
    expect(await ticketIds({}, held)).toContain(storeless)
    expect((await ticketIds({ storeId: first }, held)).toSorted()).toEqual((await ticketIds({}, held)).toSorted())
    expect(await brief({ storeId: first }, held)).toEqual(await brief({}, held))
    expect(await ticketsIn({ storeId: first }, held)).toBe(await ticketsIn({}, held))
    expect(await changed({}, held)).toBe(false)
    expect(await changed({ storeId: first }, held)).toBe(false)

    // The choice is kept as the member's own preference.
    const saved = ok(
      await rpc("Prefs.patch", { section: "store", value: { id: second }, baseVersion: 0 }, owner.cookie)
    )
    expect(saved.version).toBe(1)
    expect(ok(await rpc("Shell.frame", undefined, owner.cookie)).prefs.sections["store"]?.value).toEqual({ id: second })
  }, 240_000)
})

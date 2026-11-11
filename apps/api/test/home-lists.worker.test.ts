import { describe, expect, it } from "vitest"
import { join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * Start's other views (step 12.3b, M10.3b): Mijn werk, the agenda and the activity feed read rows, and each narrows to
 * what the role may open. Over the recorded twin's five orders, a to-do, a ticket assigned to the owner with a
 * deadline, and an invitation the owner sent.
 */

const DAY = 86_400_000

const dayIn = (timeZone: string, at: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)

describe("Start's lists", () => {
  it("gathers the owner's work, dates it on the agenda and tells what happened", async () => {
    const store = await importedStore("home-lists")
    const me = ok(await sessionMe(store.cookie)).principals[0]!
    const today = dayIn("Europe/Amsterdam", Date.now())
    const dueAt = Date.now() + 2 * 3_600_000

    ok(await rpc("Todos.add", { text: "Leverancier bellen", due: today }, store.cookie))
    const ticket = ok(
      await rpc(
        "Tickets.create",
        { title: "Pakket kwijt", priority: "high", assigneeIds: [me.id], dueAt },
        store.cookie
      )
    ).tickets[0]!
    ok(
      await rpc("Suppliers.create", {
        name: "Atelier Lijst",
        contactEmail: `lijst-${run}@supplier.example`,
        contactPhone: "",
        description: ""
      }, store.cookie)
    )
    const email = `home-lists-${run}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "finance", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)

    const work = ok(await rpc("Home.work", undefined, store.cookie))
    expect(work.timezone).toBe("Europe/Amsterdam")
    const kinds = work.rows.map((r) => r.kind)
    expect(work.rows.find((r) => r.kind === "todo")).toMatchObject({ title: "Leverancier bellen", dueDay: today })
    expect(work.rows.find((r) => r.kind === "ticket")).toMatchObject({
      id: `ticket:${ticket.id}`,
      subjectId: ticket.id,
      title: "Pakket kwijt",
      priority: "high",
      dueAt,
      doneAt: null
    })
    const invite = work.rows.find((r) => r.kind === "invite")
    // Followed up the day before it lapses.
    expect(invite).toMatchObject({ title: email, dueAt: expect.any(Number) })
    expect(kinds.every((k) => ["todo", "queue", "ticket", "supplier", "invite"].includes(k))).toBe(true)

    // The ticket's deadline is today's; the invitation lapses the day after it is to be followed up.
    const day = ok(await rpc("Home.agenda", { from: today, span: "day" }, store.cookie))
    expect(day.rows.find((r) => r.kind === "ticket")).toMatchObject({ subjectId: ticket.id, at: dueAt, signal: "red" })
    expect(day.rows.find((r) => r.kind === "todo")).toMatchObject({ title: "Leverancier bellen", allDay: true })
    expect(day.rows.map((r) => r.at)).toEqual(day.rows.map((r) => r.at).toSorted((a, b) => a - b))
    const lapses = dayIn("Europe/Amsterdam", invite!.dueAt! + DAY)
    const week = ok(await rpc("Home.agenda", { from: lapses, span: "week" }, store.cookie))
    expect(week.rows.find((r) => r.kind === "invite")).toMatchObject({ title: email, past: false })
    const later = dayIn("Europe/Amsterdam", Date.now() + 60 * DAY)
    expect(ok(await rpc("Home.agenda", { from: later, span: "week" }, store.cookie)).rows).toEqual([])

    // The five orders the store placed, the ticket the owner made, newest first, with the record named.
    const feed = ok(await rpc("Home.activity", { limit: 3 }, store.cookie))
    expect(feed.rows.length).toBe(3)
    expect(feed.total).toBeGreaterThan(5)
    expect(feed.next).not.toBeNull()
    expect(feed.rows.map((r) => r.at)).toEqual(feed.rows.map((r) => r.at).toSorted((a, b) => b - a))
    const created = ok(await rpc("Home.activity", { source: "ticket" }, store.cookie))
    expect(created.rows.find((r) => r.action === "ticket.created")).toMatchObject({
      subjectId: ticket.id,
      actorKey: `member:${me.id}`,
      actorName: expect.any(String),
      label: `#${ticket.number}`
    })
    const placed = ok(await rpc("Home.activity", { source: "order", limit: 200 }, store.cookie))
    const orders = placed.rows.filter((r) => r.action === "order.placed")
    expect(orders.length).toBe(5)
    expect(orders[0]).toMatchObject({ actorKind: "shop", amountMinor: expect.any(Number), label: expect.any(String) })
    expect(feed.sources.map((s) => s.source)).toEqual(expect.arrayContaining(["order", "ticket"]))
    expect(feed.actors.find((a) => a.key === `member:${me.id}`)).toBeDefined()
    const suppliers = ok(await rpc("Home.activity", { source: "supplier" }, store.cookie))
    expect(suppliers.rows.find((r) => r.action === "supplier.created")).toMatchObject({ label: "Atelier Lijst" })

    // Paging walks the whole feed once.
    const seen = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const p = ok(await rpc("Home.activity", { limit: 4, ...(cursor === undefined ? {} : { cursor }) }, store.cookie))
      for (const r of p.rows) seen.add(r.id)
      if (p.next === null) break
      cursor = p.next
    }
    expect(seen.size).toBe(feed.total)

    // Only the owner's own actions under "Wie".
    const mine = ok(await rpc("Home.activity", { who: `member:${me.id}` }, store.cookie))
    expect(mine.rows.every((r) => r.actorKey === `member:${me.id}`)).toBe(true)

    // Financiën holds no Klantenservice: no ticket on their list, their agenda or in their feed, and the owner's
    // invitations are not theirs to follow up. The suppliers and the orders are.
    const finance = await join(email)
    const theirs = ok(await rpc("Home.work", undefined, finance))
    expect(theirs.rows.some((r) => r.kind === "ticket" || r.kind === "invite")).toBe(false)
    expect(ok(await rpc("Home.agenda", { from: today, span: "day" }, finance)).rows.some((r) => r.kind === "ticket"))
      .toBe(false)
    const theirFeed = ok(await rpc("Home.activity", { limit: 200 }, finance))
    expect(theirFeed.rows.some((r) => r.subjectType === "ticket")).toBe(false)
    expect(theirFeed.rows.some((r) => r.action === "supplier.created")).toBe(true)
    expect(theirFeed.rows.filter((r) => r.action === "order.placed").length).toBe(5)
  })
})

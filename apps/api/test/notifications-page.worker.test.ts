import { describe, expect, it } from "vitest"
import { join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * The notifications page on the server (PLAN 10, M5.2): a tab read as many rows as the page asks for as it scrolls;
 * a note set aside comes back by itself, unread, once its time has come; and a note about a store's record is in the
 * lists of whoever reaches that store only, in every tab, while nobody reads or changes another member's note by its
 * id.
 */

type Tab = "inbox" | "later" | "cleared"

const tab = async (cookie: string, name: Tab, limit?: number) =>
  ok(await rpc("Notifications.list", { tab: name, cursor: null, ...(limit === undefined ? {} : { limit }) }, cookie))

const everyTab = async (
  cookie: string
) => [
  ...(await tab(cookie, "inbox")).items,
  ...(await tab(cookie, "later")).items,
  ...(await tab(cookie, "cleared")).items
]

describe("the notifications page", () => {
  let store = { cookie: "", workspace: "" }
  let wide = ""
  let wideId = ""
  let fenced = ""
  let fencedId = ""

  it("reads a tab as many rows as it asks for", async () => {
    store = await importedStore("ntc-page")
    // A colleague who reaches every store, and one held to another store than this one.
    const made = ok(await rpc("Roles.create", { label: "Andere winkel", from: "service" }, store.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: role.levels,
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: ["store_elsewhere"]
      }, store.cookie)
    )
    const wideEmail = `ntc-${run}-wide@invited.test`
    const fencedEmail = `ntc-${run}-fenced@invited.test`
    ok(
      await rpc("Invitations.send", {
        rows: [{ email: wideEmail, roleId: "service", stores: "all" }, {
          email: fencedEmail,
          roleId: role.id,
          stores: "all"
        }]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    wide = await join(wideEmail)
    fenced = await join(fencedEmail)
    wideId = ok(await sessionMe(wide)).principals[0]!.id
    fencedId = ok(await sessionMe(fenced)).principals[0]!.id
    await relay(store.workspace)

    // Both joined: two notes for the owner, newest first.
    const all = await tab(store.cookie, "inbox")
    expect(all.items.filter((n) => n.kind === "team.invite")).toHaveLength(2)
    const one = await tab(store.cookie, "inbox", 1)
    expect(one.items.map((n) => n.id)).toEqual([all.items[0]!.id])
    expect(one.next).not.toBeNull()
    expect((await tab(store.cookie, "inbox", all.items.length)).next).toBeNull()
  })

  it("brings a note set aside back to the inbox, unread, once its time has come", async () => {
    const [note] = (await tab(store.cookie, "inbox")).items
    ok(await rpc("Notifications.setRead", { ids: [note!.id], read: true }, store.cookie))
    const before = ok(await rpc("Notifications.counts", undefined, store.cookie))
    const set = ok(await rpc("Notifications.snooze", { ids: [note!.id], until: Date.now() + 1_500 }, store.cookie))
    expect(set.later).toBe(1)
    const later = (await tab(store.cookie, "later")).items
    expect(later).toMatchObject([{ id: note!.id, state: "later", read: true }])
    expect((await tab(store.cookie, "inbox")).items.map((n) => n.id)).not.toContain(note!.id)

    await new Promise((resolve) => setTimeout(resolve, 1_800))
    const back = (await tab(store.cookie, "inbox")).items.find((n) => n.id === note!.id)
    expect(back).toMatchObject({ state: "inbox", read: false })
    expect(ok(await rpc("Notifications.counts", undefined, store.cookie))).toMatchObject({
      unread: before.unread + 1,
      later: 0
    })
    // Read again after it came back, it is read.
    ok(await rpc("Notifications.setRead", { ids: [note!.id], read: true }, store.cookie))
    expect((await tab(store.cookie, "inbox")).items.find((n) => n.id === note!.id)?.read).toBe(true)
    expect(ok(await rpc("Notifications.counts", undefined, store.cookie)).unread).toBe(before.unread)

    // Set aside a second time, it comes back unread a second time.
    ok(await rpc("Notifications.snooze", { ids: [note!.id], until: Date.now() + 1_000 }, store.cookie))
    await new Promise((resolve) => setTimeout(resolve, 1_300))
    expect((await tab(store.cookie, "inbox")).items.find((n) => n.id === note!.id)?.read).toBe(false)
    ok(await rpc("Notifications.setRead", { ids: [note!.id], read: true }, store.cookie))

    // Cleared from Later, it stays read in Gewist when its old time comes.
    ok(await rpc("Notifications.snooze", { ids: [note!.id], until: Date.now() + 1_000 }, store.cookie))
    ok(await rpc("Notifications.clear", { ids: [note!.id] }, store.cookie))
    await new Promise((resolve) => setTimeout(resolve, 1_300))
    expect((await tab(store.cookie, "cleared")).items.find((n) => n.id === note!.id)).toMatchObject({
      state: "cleared",
      read: true,
      snoozedUntil: null
    })
    ok(await rpc("Notifications.restore", { ids: [note!.id] }, store.cookie))
    expect(ok(await rpc("Notifications.counts", undefined, store.cookie)).unread).toBe(before.unread)
  })

  it("lists a note about a store's record only for who reaches that store, and nobody else's by its id", async () => {
    const [order] = ok(await rpc("Orders.list", { limit: 1 }, store.cookie)).rows
    const ticket = ok(
      await rpc("Tickets.create", {
        title: "Klant vraagt waar het pakket is",
        related: { type: "order", id: order!.id }
      }, store.cookie)
    ).tickets[0]!
    ok(
      await rpc("Tickets.comment", {
        id: ticket.id,
        body: "Kunnen jullie dit oppakken?",
        mentions: [wideId, fencedId]
      }, store.cookie)
    )
    await relay(store.workspace)

    const heard = (await tab(wide, "inbox")).items.find((n) => n.kind === "chat.mention" && n.subjectId === ticket.id)
    expect(heard).toMatchObject({ subjectType: "ticket", read: false })
    // The member held to another store hears nothing of it, in no tab.
    expect((await everyTab(fenced)).filter((n) => n.subjectId === ticket.id)).toEqual([])

    // Nor can they read, clear, set aside or restore their colleague's note by its id.
    ok(await rpc("Notifications.setRead", { ids: [heard!.id], read: true }, fenced))
    ok(await rpc("Notifications.clear", { ids: [heard!.id] }, fenced))
    ok(await rpc("Notifications.snooze", { ids: [heard!.id], until: Date.now() + 3_600_000 }, fenced))
    ok(await rpc("Notifications.restore", { ids: [heard!.id] }, fenced))
    expect((await everyTab(fenced)).filter((n) => n.id === heard!.id)).toEqual([])
    expect((await tab(wide, "inbox")).items.find((n) => n.id === heard!.id)).toMatchObject({
      state: "inbox",
      read: false
    })

    // Set aside and cleared, it is still theirs alone.
    ok(await rpc("Notifications.snooze", { ids: [heard!.id], until: Date.now() + 3_600_000 }, wide))
    expect((await everyTab(fenced)).filter((n) => n.id === heard!.id)).toEqual([])
    ok(await rpc("Notifications.clear", { ids: [heard!.id] }, wide))
    expect((await tab(wide, "cleared")).items.map((n) => n.id)).toContain(heard!.id)
    expect((await everyTab(fenced)).filter((n) => n.id === heard!.id)).toEqual([])
  })
})

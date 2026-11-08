import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * In-app notifications on the server (step 7.3, M5.2): the relay's sink tells whoever should hear of an event (the
 * inviter that a colleague joined, the team's managers that someone asks for access, the asker the answer), each
 * through their own tabs; the inbox is the member's own, read, cleared and set aside; an in-app switch turned off is
 * heard nowhere.
 */

const open = async (cookie: string) => {
  const response = await call("http://api.test/api/realtime", { headers: { upgrade: "websocket", cookie } })
  const socket = response.webSocket!
  const frames: Array<{ type: string; [field: string]: unknown }> = []
  socket.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
  socket.accept()
  return { socket, frames }
}

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 50; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`waited for ${what}`)
}

const inbox = async (cookie: string) =>
  ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items

describe("notifications", () => {
  let owner = { email: "", cookie: "" }
  let colleague = ""
  let workspace = ""
  let colleagueId = ""

  it("tells the inviter that the colleague joined, live in their tab", async () => {
    owner = await person("notes-owner", "Bel B.V.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const tab = await open(owner.cookie)
    const email = `notes-${run}-amber@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    colleague = await join(email)
    colleagueId = ok(await sessionMe(colleague)).principals[0]!.id
    await relay(workspace)

    const [note] = await inbox(owner.cookie)
    expect(note).toMatchObject({
      kind: "team.invite",
      primary: false,
      subjectType: "member",
      subjectId: colleagueId,
      actor: { kind: "member", id: colleagueId, name: expect.stringContaining("amber") },
      data: { via: "invitation" },
      read: false,
      state: "inbox"
    })
    expect(ok(await rpc("Notifications.counts", undefined, owner.cookie))).toMatchObject({
      unread: 1,
      primaryUnread: 0
    })
    await until(() => tab.frames.some((f) => f.type === "notes.changed"), "notes.changed")
    expect(tab.frames.find((f) => f.type === "notes.changed")).toMatchObject({ unread: 1 })
    // The colleague's own inbox is empty: nobody else's rows show.
    expect(await inbox(colleague)).toEqual([])
    tab.socket.close(1000, "done")
  })

  it("tells the managers of a request for access, and the asker the answer", async () => {
    ok(await rpc("Access.request", { area: "team", level: 2, path: "/settings/team" }, colleague))
    await relay(workspace)
    const asked = (await inbox(owner.cookie)).find((n) => n.kind === "team.access")
    expect(asked).toMatchObject({
      primary: true,
      actor: { id: colleagueId },
      data: { area: "team", level: 2, state: "open" }
    })
    expect(await inbox(colleague)).toEqual([])

    ok(await rpc("Access.grant", { id: asked!.subjectId! }, owner.cookie))
    await relay(workspace)
    const [answer] = await inbox(colleague)
    expect(answer).toMatchObject({ kind: "team.access", data: { state: "granted" }, actor: { kind: "member" } })
  })

  it("reads, clears and restores, sets aside until later, and marks everything read", async () => {
    const notes = await inbox(owner.cookie)
    const [first, second] = notes
    expect(ok(await rpc("Notifications.setRead", { ids: [first!.id], read: true }, owner.cookie)).unread).toBe(
      notes.length - 1
    )
    ok(await rpc("Notifications.clear", { ids: [first!.id] }, owner.cookie))
    const cleared = ok(await rpc("Notifications.list", { tab: "cleared", cursor: null }, owner.cookie)).items
    expect(cleared.map((n) => n.id)).toEqual([first!.id])
    ok(await rpc("Notifications.restore", { ids: [first!.id] }, owner.cookie))
    expect((await inbox(owner.cookie)).map((n) => n.id)).toContain(first!.id)

    expect(failure(await rpc("Notifications.snooze", { ids: [second!.id], until: Date.now() - 1 }, owner.cookie)))
      .toMatchObject({ _tag: "Invalid" })
    const later = ok(
      await rpc("Notifications.snooze", { ids: [second!.id], until: Date.now() + 3_600_000 }, owner.cookie)
    )
    expect(later.later).toBe(1)
    expect((await inbox(owner.cookie)).map((n) => n.id)).not.toContain(second!.id)
    expect(ok(await rpc("Notifications.markAllRead", undefined, owner.cookie)).unread).toBe(0)
  })

  it("keeps a kind out of the inbox once its in-app switch is off", async () => {
    expect(ok(await rpc("Notifications.setPref", { kind: "team.access", app: false }, owner.cookie)).app).toEqual({
      "team.access": false
    })
    expect(failure(await rpc("Notifications.setPref", { kind: "nope", app: false }, owner.cookie))).toMatchObject({
      _tag: "Invalid"
    })
    const before = (await inbox(owner.cookie)).length
    ok(await rpc("Access.request", { area: "integrations", level: 1 }, colleague))
    await relay(workspace)
    expect(await inbox(owner.cookie)).toHaveLength(before)
  })
})

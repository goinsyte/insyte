import { describe, expect, it } from "vitest"
import { failure, join, mailsTo, ok, pastUndo, person, relay, run } from "./journeys.ts"
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

/*
 * Beyond the app (M11 step 13.5): the Meldingen page's settings saved whole with an undo; a note mailed at once to a
 * member who has e-mail on for its kind (with the app off too); "Alleen als het mij betreft" keeping what does not
 * concern them out of both; the daily digest once per working day at the member's hour, and never when it is off.
 */

const notifySweep = async (workspace: string, at: Date, since?: Date) =>
  (await (await call(
    `http://api.test/api/__dev/notify/sweep?workspace=${workspace}&at=${at.toISOString()}${
      since === undefined ? "" : `&since=${since.toISOString()}`
    }`,
    { method: "POST" }
  )).json()) as { sent: number; digests: number }

/** The next Wednesday at 07:30 UTC: 08:30 in Amsterdam in winter, 09:30 in summer; a working day after 08:00. */
const nextWednesday = () => {
  const at = new Date()
  at.setUTCHours(7, 30, 0, 0)
  do at.setUTCDate(at.getUTCDate() + 1)
  while (at.getUTCDay() !== 3)
  return at
}

type MemberMail = { kind: string; url: string; subject: string | null }

const prefs = async (cookie: string) => ok(await rpc("Notifications.prefs", undefined, cookie))
const inputOf = (p: Awaited<ReturnType<typeof prefs>>) => ({
  events: p.events,
  quiet: p.quiet,
  digest: p.digest,
  follow: p.follow,
  slackChannel: p.slackChannel
})
const mails = async (to: string) => (await mailsTo(to)) as Array<MemberMail>

describe("notifications beyond the app", () => {
  let owner = { email: "", cookie: "" }
  let colleague = ""
  let colleagueEmail = ""
  let workspace = ""

  it("reads the design's defaults, with the address mail goes to and push and Slack offered, not connected", async () => {
    owner = await person("notify-owner", "Klok B.V.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const p = await prefs(owner.cookie)
    expect(Object.keys(p.events)).toHaveLength(30)
    expect(p.events["team.invite"]).toEqual({ app: true, email: true, push: false, slack: false, onlyMine: false })
    expect(p).toMatchObject({
      quiet: { on: true, from: "22:00", to: "07:00", weekend: false },
      digest: { on: true, at: "08:00" },
      follow: { assigned: true, mentioned: true, created: true },
      slackChannel: null,
      email: owner.email,
      timezone: "Europe/Amsterdam",
      alerts: { delayHours: 48, disputeAmountMinor: 10000, currency: "EUR" },
      // The worker tests run with VAPID keys and the recorded Slack app (`vitest.config.ts`).
      channels: { push: "available", slack: "available" },
      slackTeam: null
    })
  })

  it("refuses quiet hours without length, a Slack channel without Slack, and a kind it does not know", async () => {
    const p = inputOf(await prefs(owner.cookie))
    expect(failure(await rpc("Notifications.setPrefs", { ...p, quiet: { ...p.quiet, to: "22:00" } }, owner.cookie)))
      .toMatchObject({ _tag: "QuietHoursEmpty" })
    expect(failure(await rpc("Notifications.setPrefs", { ...p, slackChannel: "C0OPERATIONS" }, owner.cookie)))
      .toMatchObject({ _tag: "SlackNotConnected" })
    expect(
      failure(
        await rpc("Notifications.setPrefs", {
          ...p,
          events: { ...p.events, "geen.soort": p.events["team.invite"]! }
        }, owner.cookie)
      )
    ).toMatchObject({ _tag: "Invalid" })
    expect(failure(await rpc("Notifications.setPrefs", { ...p, slackChannel: "#ops" }, owner.cookie)))
      .toMatchObject({ _tag: "Invalid" })
    // Quiet hours off may begin when they end: there are none.
    ok(await rpc("Notifications.setPrefs", { ...p, quiet: { ...p.quiet, on: false, to: "22:00" } }, owner.cookie))
    ok(await rpc("Notifications.setPrefs", p, owner.cookie))
  })

  it("saves the page whole and puts the previous settings back on undo", async () => {
    const before = inputOf(await prefs(owner.cookie))
    const change = ok(
      await rpc("Notifications.setPrefs", {
        ...before,
        events: { ...before.events, "team.access": { ...before.events["team.access"]!, email: true, onlyMine: true } },
        quiet: { on: true, from: "23:00", to: "06:30", weekend: true },
        digest: { on: false, at: "09:00" },
        follow: { assigned: true, mentioned: false, created: true }
      }, owner.cookie)
    )
    expect(change.prefs).toMatchObject({
      events: { "team.access": { app: true, email: true, onlyMine: true } },
      quiet: { from: "23:00", to: "06:30", weekend: true },
      digest: { on: false, at: "09:00" },
      follow: { mentioned: false }
    })
    expect(change.prefs.app["team.access"]).toBe(true)
    ok(await rpc("Shared.undo", { token: change.undo.token }, owner.cookie))
    expect(inputOf(await prefs(owner.cookie))).toEqual(before)
  })

  it("mails the inviter at once that the colleague joined, with the sentence and the link", async () => {
    colleagueEmail = `notify-${run}-joost@invited.test`
    ok(
      await rpc(
        "Invitations.send",
        { rows: [{ email: colleagueEmail, roleId: "service", stores: "all" }] },
        owner.cookie
      )
    )
    await pastUndo(workspace)
    await relay(workspace)
    colleague = await join(colleagueEmail)
    await relay(workspace)
    const mail = (await mails(owner.email)).find((m) => m.kind === "member.notification")
    expect(mail).toMatchObject({
      url: "/settings/team",
      subject: expect.stringContaining("accepteerde je uitnodiging")
    })
  })

  it("mails a kind whose app switch is off, and leaves the inbox alone", async () => {
    const p = inputOf(await prefs(owner.cookie))
    ok(
      await rpc("Notifications.setPrefs", {
        ...p,
        events: { ...p.events, "team.access": { ...p.events["team.access"]!, app: false, email: true } }
      }, owner.cookie)
    )
    const before = (await inbox(owner.cookie)).length
    const mailed = (await mails(owner.email)).length
    ok(await rpc("Access.request", { area: "orders", level: 3 }, colleague))
    await relay(workspace)
    expect(await inbox(owner.cookie)).toHaveLength(before)
    const after = await mails(owner.email)
    expect(after).toHaveLength(mailed + 1)
    expect(after[0]).toMatchObject({ kind: "member.notification", url: "/settings/roles" })
  })

  it("keeps what does not concern the member out of the app and the mail with only-mine on", async () => {
    const p = inputOf(await prefs(owner.cookie))
    ok(
      await rpc("Notifications.setPrefs", {
        ...p,
        events: { ...p.events, "team.access": { app: true, email: true, push: false, slack: false, onlyMine: true } }
      }, owner.cookie)
    )
    const before = (await inbox(owner.cookie)).length
    const mailed = (await mails(owner.email)).length
    ok(await rpc("Access.request", { area: "products", level: 3 }, colleague))
    await relay(workspace)
    expect(await inbox(owner.cookie)).toHaveLength(before)
    expect(await mails(owner.email)).toHaveLength(mailed)
    const off = inputOf(await prefs(owner.cookie))
    ok(
      await rpc("Notifications.setPrefs", {
        ...off,
        events: { ...off.events, "team.access": { ...off.events["team.access"]!, onlyMine: false } }
      }, owner.cookie)
    )
  })

  it("sends the daily digest once on a working day at the member's hour, and none with it off", async () => {
    const at = nextWednesday()
    const since = new Date(Date.now() - 3_600_000)
    // The colleague turns theirs off; the owner keeps 08:00.
    const theirs = inputOf(await prefs(colleague))
    ok(await rpc("Notifications.setPrefs", { ...theirs, digest: { on: false, at: "08:00" } }, colleague))
    ok(await rpc("Access.request", { area: "integrations", level: 2 }, colleague))
    await relay(workspace)
    const unread = (await inbox(owner.cookie)).filter((n) => !n.read).length
    expect(unread).toBeGreaterThan(0)

    // Before the hour: nothing yet.
    expect((await notifySweep(workspace, new Date(at.getTime() - 3 * 3_600_000), since)).digests).toBe(0)
    expect((await notifySweep(workspace, at, since)).digests).toBe(1)
    const digest = (await mails(owner.email)).find((m) => m.kind === "member.digest")
    expect(digest?.subject).toBe(`${unread} meldingen`)
    // Once a day.
    expect((await notifySweep(workspace, new Date(at.getTime() + 3_600_000), since)).digests).toBe(0)
    expect((await mails(colleagueEmail)).filter((m) => m.kind === "member.digest")).toHaveLength(0)
  })
})

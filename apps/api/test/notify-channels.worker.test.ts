import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Notifications by push and in Slack, and answers to a notification mail (M11 step 13.5, part b), against the recorded
 * push service and Slack and with VAPID keys generated for the run (`vitest.config.ts`). A member allows push on a
 * browser (one the push service says is gone is removed when a message finds it so); the owner connects Slack by
 * OAuth, a colleague may not; a note goes by e-mail, push and Slack at once outside quiet hours and waits for their end
 * inside them; an answer to the mail from the member's own address becomes their comment on the ticket.
 */

const bytes = (n: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replaceAll("+", "-").replaceAll("/", "_")
    .replace(/=+$/, "")

const subscription = (path: string) => ({
  endpoint: `https://push.test/${path}/${run}-${Math.random().toString(36).slice(2)}`,
  keys: { p256dh: bytes(65), auth: bytes(16) },
  label: "Chrome op macOS"
})

const hash = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("")

const prefs = async (cookie: string) => ok(await rpc("Notifications.prefs", undefined, cookie))
const inputOf = (p: Awaited<ReturnType<typeof prefs>>) => ({
  events: p.events,
  quiet: p.quiet,
  digest: p.digest,
  follow: p.follow,
  slackChannel: p.slackChannel
})

interface Delivery {
  readonly recipientId: string
  readonly channel: string
  readonly kind: string
  readonly state: string
  readonly error: string | null
  readonly replyToken: string | null
}

const deliveries = async (workspace: string) =>
  ((await (await call(`http://api.test/api/__dev/notify/deliveries?workspace=${workspace}`)).json()) as {
    deliveries: Array<Delivery>
  }).deliveries

const sweep = async (workspace: string, at: Date) =>
  (await (await call(`http://api.test/api/__dev/notify/sweep?workspace=${workspace}&at=${at.toISOString()}`, {
    method: "POST"
  })).json()) as { sent: number }

const answer = async (to: string, from: string, text: string) =>
  (await (await call("http://api.test/api/__dev/mail/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to,
      raw: [
        `From: Iemand <${from}>`,
        `To: ${to}`,
        "Subject: Re: Je bent toegewezen",
        `Message-ID: <${Math.random().toString(36).slice(2)}@client.test>`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        text,
        ""
      ].join("\r\n")
    })
  })).json()) as { reply?: string }

describe("notifications by push and in Slack", () => {
  let owner = { email: "", cookie: "" }
  let colleague = ""
  let colleagueEmail = ""
  let colleagueId = ""
  let workspace = ""

  it("offers push and Slack once the stage has them, and refuses a push switch without a browser", async () => {
    owner = await person("channels-owner", "Bel B.V.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const p = await prefs(owner.cookie)
    expect(p.channels).toEqual({ push: "available", slack: "available" })
    expect(p.pushKey).toMatch(/^[A-Za-z0-9_-]{87}$/)
    expect(p.slackTeam).toBeNull()
    const input = inputOf(p)
    expect(
      failure(
        await rpc("Notifications.setPrefs", {
          ...input,
          events: { ...input.events, "team.invite": { ...input.events["team.invite"]!, push: true } }
        }, owner.cookie)
      )
    ).toMatchObject({ _tag: "PushNotRegistered" })
    expect(failure(await rpc("Notifications.testPush", undefined, owner.cookie))).toMatchObject({
      _tag: "PushNotRegistered"
    })
  })

  it("keeps a browser once, tests it, and removes one the push service says is gone", async () => {
    const browser = subscription("ok")
    const device = ok(await rpc("Notifications.subscribePush", browser, owner.cookie))
    expect(device).toMatchObject({ label: "Chrome op macOS", endpointHash: await hash(browser.endpoint) })
    // The same browser again is the same device, its keys refreshed.
    const again = ok(
      await rpc("Notifications.subscribePush", { ...browser, keys: subscription("ok").keys }, owner.cookie)
    )
    expect(again.id).toBe(device.id)
    expect(ok(await rpc("Notifications.pushDevices", undefined, owner.cookie))).toHaveLength(1)
    expect((await prefs(owner.cookie)).channels.push).toBe("connected")
    expect(ok(await rpc("Notifications.testPush", undefined, owner.cookie))).toMatchObject({ sent: 1, removed: 0 })

    ok(await rpc("Notifications.subscribePush", subscription("gone"), owner.cookie))
    expect(ok(await rpc("Notifications.testPush", undefined, owner.cookie))).toMatchObject({ sent: 1, removed: 1 })
    const left = ok(await rpc("Notifications.pushDevices", undefined, owner.cookie))
    expect(left.map((d) => d.id)).toEqual([device.id])
    expect(left[0]!.lastSentAt).not.toBeNull()

    // A browser handed to a colleague is theirs from then on.
    colleagueEmail = `channels-${run}-sanne@invited.test`
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
    colleagueId = ok(await sessionMe(colleague)).principals[0]!.id
    await relay(workspace)
    ok(await rpc("Notifications.subscribePush", browser, colleague))
    expect(ok(await rpc("Notifications.pushDevices", undefined, owner.cookie))).toHaveLength(0)
    expect(ok(await rpc("Notifications.pushDevices", undefined, colleague))).toHaveLength(1)
    const [mine] = ok(await rpc("Notifications.pushDevices", undefined, colleague))
    // Someone else's device is not theirs to remove.
    ok(await rpc("Notifications.unsubscribePush", { id: mine!.id }, owner.cookie))
    expect(ok(await rpc("Notifications.pushDevices", undefined, colleague))).toHaveLength(1)
    // Keys that are not a browser's never reach the server.
    expect(
      (await rpc("Notifications.subscribePush", { ...browser, keys: { p256dh: "kort", auth: "kort" } }, colleague))._tag
    ).toBe("Failure")
  })

  it("connects Slack by OAuth for a manager only, and lists where messages can go", async () => {
    expect(failure(await rpc("Notifications.slackChannels", undefined, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "not_connected"
    })
    expect(
      failure(await rpc("Notifications.beginSlackConnect", { returnPath: "/settings/notifications" }, colleague))
    ).toMatchObject({ _tag: "Forbidden" })
    const { authorizeUrl } = ok(
      await rpc("Notifications.beginSlackConnect", { returnPath: "/settings/notifications" }, owner.cookie)
    )
    const state = new URL(authorizeUrl).searchParams.get("state")!
    const back = await call(
      `http://api.test/api/connect/slack/callback?${new URLSearchParams({ code: "abc", state })}`,
      { headers: { cookie: owner.cookie }, redirect: "manual" }
    )
    expect(back.status).toBe(302)
    expect(back.headers.get("location")).toBe("/settings/notifications?connected=slack")
    const replay = await call(
      `http://api.test/api/connect/slack/callback?${new URLSearchParams({ code: "abc", state })}`,
      { headers: { cookie: owner.cookie }, redirect: "manual" }
    )
    expect(replay.headers.get("location")).toBe("/settings/notifications?error=slack_state")

    expect(await prefs(colleague)).toMatchObject({ channels: { slack: "connected" }, slackTeam: "Insyte Test" })
    expect(ok(await rpc("Notifications.slackChannels", undefined, colleague)).map((c) => c.name)).toEqual([
      "#algemeen",
      "#operations",
      "Privébericht aan mij"
    ])
    const input = inputOf(await prefs(colleague))
    expect(failure(await rpc("Notifications.setPrefs", { ...input, slackChannel: "#ops" }, colleague)))
      .toMatchObject({ _tag: "Invalid" })
  })

  it("sends a note by mail, push and Slack at once, and holds push and Slack through quiet hours", async () => {
    const input = inputOf(await prefs(colleague))
    const on = { app: true, email: true, push: true, slack: true, onlyMine: false }
    ok(
      await rpc("Notifications.setPrefs", {
        ...input,
        events: { ...input.events, "ticket.assigned": on },
        quiet: { ...input.quiet, on: false },
        slackChannel: "C0OPERATIONS"
      }, colleague)
    )
    const ticket = ok(await rpc("Tickets.create", { title: "Pakket kwijt" }, owner.cookie)).tickets[0]!
    ok(await rpc("Tickets.assign", { id: ticket.id, memberId: colleagueId }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const sent = (await deliveries(workspace)).filter((d) =>
      d.recipientId === colleagueId && d.kind === "ticket.assigned"
    )
    expect(sent.map((d) => [d.channel, d.state]).toSorted()).toEqual([["email", "sent"], ["push", "sent"], [
      "slack",
      "sent"
    ]])

    // All day quiet: the mail goes, push and Slack wait for the end of the hours.
    ok(
      await rpc("Notifications.setPrefs", {
        ...inputOf(await prefs(colleague)),
        quiet: { on: true, from: "00:00", to: "23:59", weekend: false },
        slackChannel: "dm"
      }, colleague)
    )
    const second = ok(await rpc("Tickets.create", { title: "Nog een" }, owner.cookie)).tickets[0]!
    ok(await rpc("Tickets.assign", { id: second.id, memberId: colleagueId }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const held = (await deliveries(workspace)).filter((d) => d.recipientId === colleagueId).slice(0, 3)
    expect(held.map((d) => [d.channel, d.state]).toSorted()).toEqual([["email", "sent"], ["push", "pending"], [
      "slack",
      "pending"
    ]])
    expect((await sweep(workspace, new Date(Date.now() + 2 * 86_400_000))).sent).toBe(2)
    const after = (await deliveries(workspace)).filter((d) => d.recipientId === colleagueId).slice(0, 3)
    expect(after.every((d) => d.state === "sent")).toBe(true)
  })

  it("makes an answer to the mail the member's comment on the ticket, and drops the rest", async () => {
    const mail = (await deliveries(workspace)).find((d) =>
      d.recipientId === colleagueId && d.channel === "email" && d.kind === "ticket.assigned"
    )!
    expect(mail.replyToken).toMatch(/^[0-9a-z]{26}$/)
    const to = `reply+${mail.replyToken}@in.goinsyte.com`
    const text = "Ik bel de klant vandaag.\r\n\r\nOp 12 nov. 2026 schreef Insyte:\r\n> Je bent toegewezen"
    expect(await answer(to, "vreemde@elders.test", text)).toEqual({ reply: "refused" })
    expect(await answer(`reply+${"0".repeat(26)}@in.goinsyte.com`, colleagueEmail, text)).toEqual({ reply: "unknown" })
    expect(await answer(to, colleagueEmail.toUpperCase(), "> alleen het citaat")).toEqual({ reply: "empty" })
    expect(await answer(to, colleagueEmail.toUpperCase(), text)).toEqual({ reply: "commented" })
    const tickets = ok(await rpc("Tickets.list", { view: "all" }, owner.cookie)).rows
    const ticket = tickets.find((t) => t.title === "Nog een" || t.title === "Pakket kwijt")!
    const detail = await Promise.all(
      tickets.filter((t) => t.title === "Nog een" || t.title === "Pakket kwijt").map(async (t) =>
        ok(await rpc("Tickets.get", { id: t.id }, owner.cookie))
      )
    )
    const comment = detail.flatMap((d) => d.comments).find((c) => c.body === "Ik bel de klant vandaag.")
    expect(ticket).toBeDefined()
    expect(comment).toMatchObject({ body: "Ik bel de klant vandaag." })
  })

  it("lets go of Slack for a manager only: every channel cleared, nothing waits for it", async () => {
    expect(failure(await rpc("Notifications.disconnectSlack", undefined, colleague))).toMatchObject({
      _tag: "Forbidden"
    })
    ok(await rpc("Notifications.disconnectSlack", undefined, owner.cookie))
    expect(await prefs(colleague)).toMatchObject({
      channels: { slack: "available" },
      slackTeam: null,
      slackChannel: null
    })
  })
})

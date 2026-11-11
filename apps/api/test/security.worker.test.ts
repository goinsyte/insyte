import { beforeAll, describe, expect, it } from "vitest"
import { cookiesOf, failure, join, ok, ORIGIN, password, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Instellingen → Beveiliging on the server (M3.1, M3.3), through the Worker: the workspace's sign-in policy and the
 * reader's own second step, read by whoever may read the settings; and the person's own sessions, listed with the
 * device and country each was opened from, the one asking first. Signing another session out ends it at once and is
 * recorded in the person's log; their current session, someone else's, or one that is gone is refused.
 */

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"

/** A second sign-in for the same person, from an iPhone in the Netherlands. */
const signInOnPhone = async (email: string) =>
  cookiesOf(
    await call("http://api.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": IPHONE, "cf-ipcountry": "NL" },
      body: JSON.stringify({ email, password })
    })
  )

const eventsOf = async (email: string) =>
  ((await (await call(`http://api.test/api/__dev/auth-events?email=${encodeURIComponent(email)}`)).json()) as {
    events: Array<{ kind: string }>
  }).events

describe("Beveiliging", () => {
  let owner = { email: "", cookie: "" }
  let viewer = ""

  beforeAll(async () => {
    owner = await person("security-owner", "Beveiliging Co.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `security-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    viewer = await join(email)
  }, 120_000)

  it("reads a new workspace's sign-in policy and the reader's own second step", async () => {
    expect(ok(await rpc("Workspaces.getSecurity", undefined, owner.cookie))).toMatchObject({
      requireMfa: false,
      googleSso: false,
      twoFactorEnabled: false
    })
    // Instellingen · Bekijken is enough to read it.
    expect(ok(await rpc("Workspaces.getSecurity", undefined, viewer)).requireMfa).toBe(false)
  })

  it("lists the person's own sessions, the one asking first, with where each was opened", async () => {
    const before = ok(await rpc("Session.listSessions", undefined, owner.cookie)).length
    const phone = await signInOnPhone(owner.email)
    const sessions = ok(await rpc("Session.listSessions", undefined, owner.cookie))
    expect(sessions).toHaveLength(before + 1)
    expect(sessions[0]).toMatchObject({ current: true })
    // Then the most recently renewed: the phone, just signed in.
    expect(sessions[1]).toMatchObject({ current: false, device: "iPhone · Safari", country: "NL" })
    expect(Number.isNaN(Date.parse(sessions[1]!.lastActiveAt))).toBe(false)
    // From the phone, the phone is the current one.
    const fromPhone = ok(await rpc("Session.listSessions", undefined, phone))
    expect(fromPhone.find((s) => s.current)?.id).toBe(sessions[1]!.id)
    // A colleague sees only their own.
    expect(ok(await rpc("Session.listSessions", undefined, viewer)).every((s) => !sessions.some((o) => o.id === s.id)))
      .toBe(true)
  })

  it("signs another session out at once, records it, and refuses the rest", async () => {
    const phone = await signInOnPhone(owner.email)
    const sessions = ok(await rpc("Session.listSessions", undefined, owner.cookie))
    const target = sessions.find((s) => !s.current)!
    const mine = sessions.find((s) => s.current)!

    // Someone else's session reads as none.
    expect(failure(await rpc("Session.revoke", { id: target.id }, viewer))).toMatchObject({
      _tag: "NotFound",
      entity: "session"
    })
    // The current one is signing out, not this.
    expect(failure(await rpc("Session.revoke", { id: mine.id }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { id: "current" }
    })

    const phoneId = ok(await rpc("Session.listSessions", undefined, phone)).find((s) => s.current)!.id
    ok(await rpc("Session.revoke", { id: phoneId }, owner.cookie))
    // The phone is signed out on its next request, despite its cookie cache.
    expect(failure(await sessionMe(phone))).toMatchObject({ _tag: "Unauthenticated" })
    expect(ok(await rpc("Session.listSessions", undefined, owner.cookie)).map((s) => s.id)).not.toContain(phoneId)
    expect(failure(await rpc("Session.revoke", { id: phoneId }, owner.cookie))).toMatchObject({ _tag: "NotFound" })
    expect((await eventsOf(owner.email)).map((e) => e.kind)).toContain("session_revoked")
  })
})

import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Cause, Exit } from "effect"
import { describe, expect, it } from "vitest"
import worker from "../src/Main.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { call, onboarding, rpc, sessionMe } from "./support.ts"

/*
 * Instellingen → Team on the server (step 4.1, M3.3–M3.4), through the Worker: the owner's team page, invitations sent
 * and mailed only after the undo window, every undo the page offers, the seats, the shareable link, and the refusals.
 */

const ORIGIN = "http://localhost:4300"
const run = Date.now().toString(36)
const password = "correct-horse-battery"

const post = (path: string, body: unknown) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body)
  })
const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

const mailsTo = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; url: string }>
  }).mails

/** A verified, signed-in person; with `workspace`, its founder too. */
const person = async (tag: string, workspace?: string) => {
  const email = `team-${run}-${tag}@example.com`
  await post("/api/auth/sign-up/email", { name: `Persoon ${tag}`, email, password })
  const link = new URL((await mailsTo(email))[0]!.url)
  await call(`http://api.test${link.pathname}${link.search}`, { redirect: "manual" })
  const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
  if (workspace !== undefined) {
    await onboarding.advance({ step: "role", persona: "admin" }, cookie)
    await onboarding.advance(
      { step: "organization", name: workspace, slug: `team-${run}-${tag}`, country: "NL", teamSize: "2-5" },
      cookie
    )
  }
  return { email, cookie }
}

const outboxOf = async (workspace: string) =>
  (await (await call(`http://api.test/api/__dev/outbox?workspace=${workspace}`)).json() as {
    events: Array<
      { id: string; event: string; payload: Record<string, unknown>; relayedAt: string | null; cancelled: boolean }
    >
  }).events
const productEventsOf = async (workspace: string) =>
  (await (await call(`http://api.test/api/__dev/product-events?workspace=${workspace}`)).json() as {
    events: Array<{ event: string; distinctId: string }>
  }).events

/** The relay's consumer, as the queue calls it, for every event of the workspace not yet relayed. */
const relay = async (workspace: string) => {
  const outboxIds = (await outboxOf(workspace)).filter((e) => e.relayedAt === null).map((e) => e.id)
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: `m-${Math.random()}`, timestamp: new Date(), attempts: 1, body: { outboxIds } }
  ])
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}
/** As if the undo window had passed. */
const pastUndo = (workspace: string) =>
  call(`http://api.test/api/__dev/outbox/due?workspace=${workspace}`, { method: "POST" })

const ok = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(Cause.pretty(exit.cause))
}
const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.find((r) => r._tag === "Fail")?.error : undefined

describe("the team on the server", () => {
  const amber = `amber-${run}@example.com`
  const ruben = `ruben-${run}@example.com`
  let owner = { email: "", cookie: "" }
  let workspace = ""

  it("shows the founder their team: themselves, the trial's seats, no invitations, the link off", async () => {
    owner = await person("owner", "Team Co.")
    const me = ok(await sessionMe(owner.cookie))
    workspace = me.principals[0]!.workspaceId
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    expect(team.members.map((m) => [m.email, m.roleId, m.deactivated])).toEqual([[owner.email, "owner", false]])
    expect(team.me).toBe(team.members[0]!.id)
    expect(team.invitations).toEqual([])
    expect(team.seats).toMatchObject({ total: 5, used: 1, active: 1, pending: 0, free: 4, full: false })
    expect(team.link).toMatchObject({ enabled: false, token: null, roleId: "view", days: 7 })
  })

  it("refuses a person without a workspace", async () => {
    const loner = await person("loner")
    expect(failure(await rpc("Team.get", undefined, loner.cookie))).toMatchObject({ _tag: "NoWorkspace" })
    expect(failure(await rpc("Team.get", undefined))).toMatchObject({ _tag: "Unauthenticated" })
  })

  it("sends invitations that take a seat, and mails them only once the undo window has passed", async () => {
    const team = ok(
      await rpc("Invitations.send", {
        rows: [
          { email: ` ${amber.toUpperCase()} `, roleId: "service", stores: "all", message: "Welkom!" },
          { email: ruben, roleId: "finance", stores: ["store_eu"] }
        ]
      }, owner.cookie)
    )
    expect(team.invitations.map((i) => [i.email, i.roleId, i.stores, i.message, i.resent])).toEqual([
      [amber, "service", "all", "Welkom!", 0],
      [ruben, "finance", ["store_eu"], null, 0]
    ])
    expect(team.seats).toMatchObject({ used: 3, pending: 2, free: 2 })

    // Inside the window the consumer leaves them be.
    await relay(workspace)
    expect(await mailsTo(amber)).toEqual([])
    expect((await outboxOf(workspace)).filter((e) => e.event === "member.invited" && e.relayedAt === null))
      .toHaveLength(2)

    await pastUndo(workspace)
    await relay(workspace)
    const [mail] = await mailsTo(amber)
    expect(mail?.kind).toBe("team.invite")
    expect(mail?.url).toMatch(new RegExp(`^${ORIGIN}/invitations/inv_[0-9a-z]{26}\\?k=[A-Za-z0-9_-]{32}$`))
    expect(await mailsTo(ruben)).toHaveLength(1)
    expect((await productEventsOf(workspace)).filter((e) => e.event === "member_invited")).toHaveLength(2)

    // Delivered again, nothing goes twice.
    await relay(workspace)
    expect(await mailsTo(amber)).toHaveLength(1)
  })

  it("says per address why it cannot be invited", async () => {
    const exit = await rpc("Invitations.send", {
      rows: [
        { email: amber, roleId: "service", stores: "all" },
        { email: owner.email, roleId: "service", stores: "all" },
        { email: "geen-adres", roleId: "service", stores: "all" },
        { email: `x-${run}@example.com`, roleId: "owner", stores: "all" },
        { email: `y-${run}@example.com`, roleId: "view", stores: "all" },
        { email: `Y-${run}@example.com`, roleId: "view", stores: "all" }
      ]
    }, owner.cookie)
    expect(failure(exit)).toMatchObject({
      _tag: "Invalid",
      fields: {
        "rows.0.email": "invited",
        "rows.1.email": "member",
        "rows.2.email": "format",
        "rows.3.roleId": "unknown",
        "rows.5.email": "duplicate"
      }
    })
  })

  it("refuses more invitations than free seats", async () => {
    const rows = [1, 2, 3].map((n) => ({
      email: `seat${n}-${run}@example.com`,
      roleId: "view",
      stores: "all" as const
    }))
    expect(failure(await rpc("Invitations.send", { rows }, owner.cookie))).toMatchObject({
      _tag: "SeatLimitReached",
      total: 5,
      free: 2
    })
  })

  it("undoes a send inside the window: revoked, and its mail never goes; restoring sends it after all", async () => {
    const tess = `tess-${run}@example.com`
    const sent = ok(
      await rpc("Invitations.send", { rows: [{ email: tess, roleId: "view", stores: "all" }] }, owner.cookie)
    )
    const id = sent.invitations.find((i) => i.email === tess)!.id
    const undone = ok(await rpc("Invitations.revoke", { ids: [id] }, owner.cookie))
    expect(undone.invitations.map((i) => i.email)).not.toContain(tess)
    expect(undone.seats.pending).toBe(2)
    await pastUndo(workspace)
    await relay(workspace)
    expect(await mailsTo(tess)).toEqual([])
    const mailRow = (await outboxOf(workspace)).find((e) => e.payload["invitationId"] === id)
    expect(mailRow).toMatchObject({ cancelled: true, relayedAt: null })

    const restored = ok(await rpc("Invitations.restore", { id }, owner.cookie))
    expect(restored.invitations.map((i) => i.email)).toContain(tess)
    await relay(workspace)
    expect(await mailsTo(tess)).toHaveLength(1)
    ok(await rpc("Invitations.revoke", { ids: [id] }, owner.cookie))
  })

  it("resends in a new round with a new link, and undoes that inside the window", async () => {
    const before = ok(await rpc("Team.get", undefined, owner.cookie)).invitations.find((i) => i.email === amber)!
    const resent = ok(await rpc("Invitations.resend", { id: before.id }, owner.cookie))
    expect(resent.invitations.find((i) => i.id === before.id)).toMatchObject({ resent: 1 })
    const undone = ok(await rpc("Invitations.undoResend", { id: before.id }, owner.cookie))
    expect(undone.invitations.find((i) => i.id === before.id)).toMatchObject({
      resent: 0,
      sentAt: before.sentAt,
      expiresAt: before.expiresAt
    })
    await pastUndo(workspace)
    await relay(workspace)
    expect(await mailsTo(amber)).toHaveLength(1)

    // Resent and left to go: a second mail, with a link unlike the first.
    ok(await rpc("Invitations.resend", { id: before.id }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const [second, first] = await mailsTo(amber)
    expect(second?.url).not.toBe(first?.url)
    expect(failure(await rpc("Invitations.undoResend", { id: before.id }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "already_sent"
    })
  })

  it("changes the role an invitation grants, never to the owner's", async () => {
    const id = ok(await rpc("Team.get", undefined, owner.cookie)).invitations.find((i) => i.email === ruben)!.id
    const team = ok(await rpc("Invitations.setRole", { id, roleId: "view" }, owner.cookie))
    expect(team.invitations.find((i) => i.id === id)?.roleId).toBe("view")
    expect(failure(await rpc("Invitations.setRole", { id, roleId: "owner" }, owner.cookie))).toMatchObject({
      _tag: "Invalid"
    })
  })

  it("leaves the owner alone: no role change, deactivation or removal", async () => {
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    const ownerId = team.members[0]!.id
    expect(failure(await rpc("Members.setRole", { id: ownerId, roleId: "admin" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "owner"
    })
    expect(failure(await rpc("Members.remove", { id: ownerId }, owner.cookie))).toMatchObject({ _tag: "Conflict" })
    expect(failure(await rpc("Members.deactivate", { id: ownerId }, owner.cookie))).toMatchObject({
      _tag: "Conflict"
    })
  })

  it("turns the link on, makes a new one, and puts the previous one back", async () => {
    const on = ok(await rpc("InviteLink.set", { enabled: true, roleId: "service", days: 30 }, owner.cookie)).link
    expect(on).toMatchObject({ enabled: true, roleId: "service", days: 30, joined: 0 })
    expect(on.token).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(on.expiresAt - on.createdAt).toBe(30 * 86_400_000)

    const fresh = ok(await rpc("InviteLink.regenerate", undefined, owner.cookie)).link
    expect(fresh.token).not.toBe(on.token)
    const back = ok(await rpc("InviteLink.undoRegenerate", undefined, owner.cookie)).link
    expect(back).toMatchObject({ token: on.token, createdAt: on.createdAt, expiresAt: on.expiresAt })
    expect(failure(await rpc("InviteLink.undoRegenerate", undefined, owner.cookie))).toMatchObject({
      _tag: "Conflict"
    })
    expect(ok(await rpc("InviteLink.set", { enabled: false }, owner.cookie)).link.enabled).toBe(false)
  })
})

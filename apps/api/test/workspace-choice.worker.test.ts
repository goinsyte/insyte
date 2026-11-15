import type { WorkspaceId } from "@insyte/domain/Ids"
import { beforeAll, describe, expect, it } from "vitest"
import { cookiesOf, failure, join, ok, outboxOf, password, pastUndo, person, post, relay, run } from "./journeys.ts"
import { call, onboarding, rpc, rpcWith, sessionMe } from "./support.ts"

/*
 * More than one workspace per person (M3.1, M3.4), through the Worker: making another one (seeded as sign-up seeds
 * it, onboarded as sign-up onboards it), switching between them (every later read is that workspace's, with that
 * membership's role), leaving one (never as its owner), handing one over (the one-owner rule, the former owner a
 * Beheerder), and the invitations to another workspace in the switcher. A switch is the session's own: another session
 * of the same person stays where it was.
 */

const finish = async (cookie: string) => {
  ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, cookie))
  ok(await onboarding.advance({ step: "store", choice: "later" }, cookie))
  ok(await onboarding.advance({ step: "ready" }, cookie))
}

const signInAgain = async (email: string) => cookiesOf(await post("/api/auth/sign-in/email", { email, password }))

/** The audit rows of a workspace, oldest first (`/api/__dev/audit`). */
const auditOf = async (workspace: string) =>
  ((await (await call(`http://api.test/api/__dev/audit?workspace=${workspace}`)).json()) as {
    rows: Array<
      { action: string; actorKind: string; actorId: string; subjectId: string; diff: Record<string, unknown> }
    >
  }).rows

/** A tab's socket on `/api/realtime`, and whether it was closed, with its code. */
const socketOf = async (cookie: string) => {
  const response = await call("http://api.test/api/realtime", { headers: { upgrade: "websocket", cookie } })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const state = { closed: null as number | null, hello: false }
  socket.addEventListener("message", (e) => {
    if (JSON.parse(String(e.data)).type === "hello") state.hello = true
  })
  socket.addEventListener("close", (e) => {
    state.closed = e.code
  })
  socket.accept()
  return { socket, state }
}

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 60; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`waited for ${what}`)
}

/** A key the member makes, bound to the read-only role. */
const keyBy = async (cookie: string) =>
  ok(
    await rpc("ApiKeys.create", {
      label: "Feed",
      access: { kind: "role", roleId: "view" },
      stores: "all",
      expiresInDays: 90,
      ips: [],
      agent: false
    }, cookie)
  ).key.id

/** Invites someone who has an account already into the owner's workspace as `roleId`; they accept from the switcher. */
const bringIn = async (ownerCookie: string, who: { email: string; cookie: string }, roleId: string) => {
  ok(await rpc("Invitations.send", { rows: [{ email: who.email, roleId, stores: "all" }] }, ownerCookie))
  const id = ok(await rpc("Team.get", undefined, ownerCookie)).invitations.find((i) => i.email === who.email)!.id
  ok(await rpc("Workspaces.acceptInvite", { id }, who.cookie))
}

const NEW = (tag: string) => ({ name: `Tweede ${tag}`, slug: `tweede-${run}-${tag}`, country: "NL", teamSize: "1" })

describe("a second workspace", () => {
  let owner = { email: "", cookie: "" }
  let first = "" as WorkspaceId
  let second = "" as WorkspaceId
  let colleague = ""

  beforeAll(async () => {
    owner = await person("choice-owner", "Eerste Co.")
    await finish(owner.cookie)
    first = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `choice-${run}-colleague@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner.cookie))
    await pastUndo(first)
    await relay(first)
    colleague = await join(email)
  }, 120_000)

  it("refuses someone still in their first onboarding: they found it there", async () => {
    const fresh = await person("choice-fresh")
    expect(failure(await rpc("Workspaces.create", NEW("fresh"), fresh.cookie))).toMatchObject({
      _tag: "NotCurrentStep"
    })
  })

  it("is made with its five roles and its owner, and the session goes on in it, into onboarding", async () => {
    expect(failure(await rpc("Workspaces.create", { ...NEW("bad"), slug: "Niet Goed" }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { slug: "format" }
    })
    const made = ok(await rpc("Workspaces.create", NEW("owner"), owner.cookie))
    second = made.workspaceId
    expect(made.landing).toBe("/onboarding")
    const me = ok(await sessionMe(owner.cookie))
    expect(me.activePrincipal?.workspaceId).toBe(second)
    expect(me.landing).toBe("/onboarding")
    expect(me.principals.map((p) => p.workspaceId).toSorted()).toEqual([first, second].toSorted())

    const roles = ok(await rpc("Roles.list", undefined, owner.cookie)).roles
    expect(roles.map((r) => r.id).toSorted()).toEqual(["admin", "finance", "owner", "service", "view"])
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    expect(team.members.map((m) => m.roleId)).toEqual(["owner"])
    expect((await outboxOf(second)).some((e) => e.event === "workspace.created")).toBe(true)

    // Onboarding resumes on the plan step for it; the plan starts its trial, as at sign-up.
    expect(ok(await onboarding.me(owner.cookie))).toMatchObject({ step: "plan", completed: false })
    await finish(owner.cookie)
    expect(ok(await sessionMe(owner.cookie)).landing).toBe("/dashboard")
    const listed = ok(await rpc("Workspaces.list", undefined, owner.cookie))
    expect(listed.map((w) => [w.id, w.active, w.own, w.members])).toEqual([
      [second, true, true, 1],
      [first, false, true, 2]
    ])
    expect(listed[0]!.plan).toBe("growth")
  })

  it("switches: every read is then the other workspace's, and Start's checklist is its own", async () => {
    expect(ok(await rpc("Shell.frame", undefined, owner.cookie)).workspace.id).toBe(second)
    expect(ok(await onboarding.start(owner.cookie)).workspaceName).toBe("Tweede owner")
    // Another session of the same person is not moved by this one's switch.
    const other = await signInAgain(owner.email)

    ok(await rpc("Workspaces.switch", { workspaceId: first }, owner.cookie))
    expect(ok(await rpc("Shell.frame", undefined, owner.cookie)).workspace.id).toBe(first)
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).members).toHaveLength(2)
    expect(ok(await onboarding.start(owner.cookie)).workspaceName).toBe("Eerste Co.")
    expect(ok(await sessionMe(owner.cookie)).activePrincipal?.workspaceId).toBe(first)

    const switched = ok(await rpc("Workspaces.switch", { workspaceId: second }, owner.cookie))
    expect(switched).toMatchObject({ workspaceId: second, landing: "/dashboard" })
    expect(ok(await rpc("Team.get", undefined, owner.cookie)).members).toHaveLength(1)
    expect(ok(await rpc("Shell.frame", undefined, other)).workspace.id).toBe(second)
    ok(await rpc("Workspaces.switch", { workspaceId: first }, other))
    expect(ok(await rpc("Shell.frame", undefined, owner.cookie)).workspace.id).toBe(second)
  })

  it("refuses a workspace or principal the person does not hold, as no such thing", async () => {
    const colleagueMe = ok(await sessionMe(colleague))
    expect(failure(await rpc("Workspaces.switch", { workspaceId: second }, colleague))).toMatchObject({
      _tag: "NotFound"
    })
    expect(ok(await sessionMe(colleague)).activePrincipal).toEqual(colleagueMe.activePrincipal)
    expect(ok(await rpc("Shell.frame", undefined, colleague)).workspace.id).toBe(first)
  })

  it("never lets the owner leave; a colleague leaves, and only a new invitation brings them back", async () => {
    expect(failure(await rpc("Workspaces.leave", { workspaceId: first }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "owner"
    })
    const memberId = ok(await sessionMe(colleague)).activePrincipal!.id
    ok(await rpc("Workspaces.leave", { workspaceId: first }, colleague))
    expect(ok(await sessionMe(colleague)).principals).toEqual([])
    expect(failure(await rpc("Team.get", undefined, colleague))).toMatchObject({ _tag: "NoWorkspace" })
    ok(await rpc("Workspaces.switch", { workspaceId: first }, owner.cookie))
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    expect(team.members.map((m) => m.id)).not.toContain(memberId)
    expect(failure(await rpc("Members.restore", { id: memberId }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "left"
    })
    expect(failure(await rpc("Workspaces.leave", { workspaceId: first }, colleague))).toMatchObject({
      _tag: "NotFound"
    })
  })

  it("founds at most three workspaces per person, the first included, even asked twice at once", async () => {
    // Two "Nieuwe werkruimte" at the same moment with one left: one is founded, the other refused.
    const [a, b] = await Promise.all([
      rpc("Workspaces.create", NEW("third"), owner.cookie),
      rpc("Workspaces.create", NEW("fourth"), owner.cookie)
    ])
    expect([a, b].map((r) => r._tag).toSorted()).toEqual(["Failure", "Success"])
    expect(failure([a, b].find((r) => r._tag === "Failure")!)).toMatchObject({ _tag: "Conflict", reason: "limit" })
    await finish(owner.cookie)
    expect(failure(await rpc("Workspaces.create", NEW("fifth"), owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "limit"
    })
    expect(ok(await rpc("Workspaces.list", undefined, owner.cookie))).toHaveLength(3)
  })
})

describe("handing a workspace over", () => {
  let owner = { email: "", cookie: "" }
  let workspace = "" as WorkspaceId
  let admin = ""
  let adminId = ""

  beforeAll(async () => {
    owner = await person("handover-owner", "Overdracht Co.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `handover-${run}-admin@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    admin = await join(email)
    adminId = ok(await sessionMe(admin)).activePrincipal!.id
  }, 120_000)

  it("is the owner's alone, never to themselves or to no one", async () => {
    expect(failure(await rpc("Workspaces.transferOwnership", { memberId: adminId }, admin))).toMatchObject({
      _tag: "Forbidden",
      permission: "owner"
    })
    const self = ok(await sessionMe(owner.cookie)).activePrincipal!.id
    expect(failure(await rpc("Workspaces.transferOwnership", { memberId: self }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "self"
    })
    expect(failure(await rpc("Workspaces.transferOwnership", { memberId: "mem_none" }, owner.cookie))).toMatchObject({
      _tag: "NotFound"
    })
    ok(await rpc("Members.deactivate", { id: adminId }, owner.cookie))
    expect(failure(await rpc("Workspaces.transferOwnership", { memberId: adminId }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "deactivated"
    })
    ok(await rpc("Members.reactivate", { id: adminId }, owner.cookie))
  })

  it("makes the member the one owner and the former owner a Beheerder, from their next request", async () => {
    const team = ok(await rpc("Workspaces.transferOwnership", { memberId: adminId }, owner.cookie))
    const roleOf = (id: string) => team.members.find((m) => m.id === id)?.roleId
    const self = ok(await sessionMe(owner.cookie)).activePrincipal!.id
    expect([roleOf(adminId), roleOf(self)]).toEqual(["owner", "admin"])
    expect(team.members.filter((m) => m.roleId === "owner")).toHaveLength(1)
    expect(ok(await sessionMe(admin)).activePrincipal?.roleLabel).toBe("Eigenaar")
    expect(ok(await sessionMe(owner.cookie)).activePrincipal?.roleLabel).toBe("Beheerder")
    // No way back but the new owner's own transfer.
    expect(failure(await rpc("Workspaces.transferOwnership", { memberId: self }, owner.cookie))).toMatchObject({
      _tag: "Forbidden"
    })
    // The former owner may leave now; the new one may not.
    expect(failure(await rpc("Workspaces.leave", { workspaceId: workspace }, admin))).toMatchObject({
      reason: "owner"
    })
    expect((await auditOf(workspace)).filter((r) => r.action === "workspace.ownership_transferred")).toEqual([
      {
        action: "workspace.ownership_transferred",
        actorKind: "member",
        actorId: self,
        subjectId: adminId,
        diff: { owner: [self, adminId], role: ["service", "owner"], formerOwnerRole: "admin" }
      }
    ])
  })

  it("hands over once when two transfers run at the same moment; the other is refused, not a fault", async () => {
    const boss = await person("handover-race", "Race Co.")
    const shop = ok(await sessionMe(boss.cookie)).principals[0]!.workspaceId
    const emails = ["a", "b"].map((t) => `race-${run}-${t}@invited.test`)
    ok(
      await rpc("Invitations.send", {
        rows: emails.map((email) => ({ email, roleId: "admin", stores: "all" as const }))
      }, boss.cookie)
    )
    await pastUndo(shop)
    await relay(shop)
    const ids = []
    for (const email of emails) ids.push(ok(await sessionMe(await join(email))).activePrincipal!.id)
    const [a, b] = await Promise.all(
      ids.map((memberId) => rpc("Workspaces.transferOwnership", { memberId }, boss.cookie))
    )
    const outcomes = [a!, b!].map((e) => (e._tag === "Success" ? "owner" : failure(e)))
    expect(outcomes.filter((o) => o === "owner")).toHaveLength(1)
    expect(outcomes.find((o) => o !== "owner")).toMatchObject({ _tag: "Conflict", reason: "not_owner" })
    const team = ok(await rpc("Team.get", undefined, boss.cookie))
    expect(team.members.filter((m) => m.roleId === "owner")).toHaveLength(1)
  })
})

describe("an invitation to another workspace, in the switcher", () => {
  let inviter = { email: "", cookie: "" }
  let invitee = { email: "", cookie: "" }
  let stranger = { email: "", cookie: "" }
  let workspace = "" as WorkspaceId
  let id = ""

  beforeAll(async () => {
    inviter = await person("switcher-inviter", "Uitnodiger Co.")
    invitee = await person("switcher-invitee", "Eigen Co.")
    stranger = await person("switcher-stranger", "Vreemd Co.")
    workspace = ok(await sessionMe(inviter.cookie)).principals[0]!.workspaceId
    ok(
      await rpc(
        "Invitations.send",
        { rows: [{ email: invitee.email, roleId: "finance", stores: "all" }] },
        inviter.cookie
      )
    )
    id = ok(await rpc("Team.get", undefined, inviter.cookie)).invitations.find((i) => i.email === invitee.email)!.id
  }, 120_000)

  it("is listed to the person it is addressed to, and to no one else", async () => {
    expect(ok(await rpc("Workspaces.listInvites", undefined, invitee.cookie))).toEqual([
      expect.objectContaining({
        id,
        workspaceId: workspace,
        workspace: "Uitnodiger Co.",
        invitedBy: "Persoon switcher-inviter",
        role: "Financiën",
        members: 1
      })
    ])
    expect(ok(await rpc("Workspaces.listInvites", undefined, stranger.cookie))).toEqual([])
    expect(failure(await rpc("Workspaces.acceptInvite", { id }, stranger.cookie))).toMatchObject({
      _tag: "NotAcceptable",
      state: "missing"
    })
    expect(failure(await rpc("Workspaces.declineInvite", { id }, stranger.cookie))).toMatchObject({
      _tag: "NotAcceptable"
    })
  })

  it("is declined and, inside the undo window, back", async () => {
    ok(await rpc("Workspaces.declineInvite", { id }, invitee.cookie))
    expect(ok(await rpc("Workspaces.listInvites", undefined, invitee.cookie))).toEqual([])
    expect(failure(await rpc("Workspaces.restoreInvite", { id }, stranger.cookie))).toMatchObject({
      _tag: "NotFound"
    })
    ok(await rpc("Workspaces.restoreInvite", { id }, invitee.cookie))
    expect(ok(await rpc("Workspaces.listInvites", undefined, invitee.cookie)).map((i) => i.id)).toEqual([id])
  })

  it("is accepted there: the workspace joins the person's list, the session stays where it was", async () => {
    const before = ok(await sessionMe(invitee.cookie)).activePrincipal?.workspaceId
    expect(ok(await rpc("Workspaces.acceptInvite", { id }, invitee.cookie))).toMatchObject({
      workspaceId: workspace,
      workspace: "Uitnodiger Co."
    })
    const listed = ok(await rpc("Workspaces.list", undefined, invitee.cookie))
    expect(listed.find((w) => w.id === workspace)).toMatchObject({ role: "Financiën", own: false, active: false })
    expect(ok(await rpc("Workspaces.listInvites", undefined, invitee.cookie))).toEqual([])
    // Joining makes the joined workspace the newest; the session had not chosen one, so it is the active one now,
    // until the person switches.
    ok(await rpc("Workspaces.switch", { workspaceId: before! }, invitee.cookie))
    expect(ok(await rpc("Shell.frame", undefined, invitee.cookie)).workspace.id).toBe(before)
    // Taken up, it routes nowhere from the switcher any more: not accepted again, not declined, not "undone".
    for (const step of ["Workspaces.acceptInvite", "Workspaces.declineInvite"] as const) {
      expect(failure(await rpc(step, { id }, invitee.cookie))).toMatchObject({
        _tag: "NotAcceptable",
        state: "missing"
      })
    }
    expect(failure(await rpc("Workspaces.restoreInvite", { id }, invitee.cookie))).toMatchObject({ _tag: "NotFound" })
  })
})

describe("one session, one workspace", () => {
  let owner = { email: "", cookie: "" }
  let leaver = { email: "", cookie: "" }
  let shop = "" as WorkspaceId
  let own = "" as WorkspaceId

  beforeAll(async () => {
    owner = await person("pin-owner", "Winkel Co.")
    shop = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    leaver = await person("pin-leaver", "Eigen Zaak")
    own = ok(await sessionMe(leaver.cookie)).principals[0]!.workspaceId
  }, 120_000)

  it("stays in the workspace it is in when the person joins another", async () => {
    // A session that never chose one is held to the one it first acts in; joining a newer one does not move it.
    const again = await signInAgain(leaver.email)
    expect(ok(await rpc("Shell.frame", undefined, again)).workspace.id).toBe(own)
    await bringIn(owner.cookie, leaver, "admin")
    expect(ok(await rpc("Shell.frame", undefined, again)).workspace.id).toBe(own)
    expect(ok(await sessionMe(again)).activePrincipal?.workspaceId).toBe(own)
  })

  it("refuses a call from a tab that names another workspace than the session's", async () => {
    ok(await rpc("Workspaces.switch", { workspaceId: shop }, leaver.cookie))
    const named = (workspace: string) => ({ cookie: leaver.cookie, "x-insyte-workspace": workspace })
    expect(ok(await rpcWith("Team.get", undefined, named(shop)))).toBeDefined()
    expect(failure(await rpcWith("Team.get", undefined, named(own)))).toMatchObject({ _tag: "WorkspaceMismatch" })
    expect(failure(await rpcWith("Roles.create", { label: "Verkeerde tab", from: "service" }, named(own))))
      .toMatchObject({ _tag: "WorkspaceMismatch" })
    expect(ok(await rpc("Roles.list", undefined, owner.cookie)).roles.map((r) => r.label)).not.toContain(
      "Verkeerde tab"
    )
  })

  it("refuses an upload and Start's checklist from a tab that names another workspace", async () => {
    // The session is in the shop (the test before switched it); a tab still showing the person's own workspace.
    const csv = "e-mail,naam\nanna@example.com,Anna\n"
    const upload = (workspace: string) =>
      call("http://api.test/api/data/imports", {
        method: "PUT",
        headers: {
          cookie: leaver.cookie,
          "x-insyte-workspace": workspace,
          "content-type": "text/csv",
          "content-length": String(new TextEncoder().encode(csv).byteLength),
          "x-file-name": "klanten.csv"
        },
        body: csv
      })
    const refused = await upload(own)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: { code: "WorkspaceMismatch" } })
    expect((await upload(shop)).status).toBe(201)
    const named = { cookie: leaver.cookie, "x-insyte-workspace": own }
    expect(failure(await rpcWith("Onboarding.start", undefined, named))).toMatchObject({ _tag: "WorkspaceMismatch" })
    expect(failure(await rpcWith("Onboarding.completeTask", { task: "alerts", done: true }, named))).toMatchObject({
      _tag: "WorkspaceMismatch"
    })
  })

  it("leaves: keys revoked, sockets closed, other sessions fall back, and no way back in but an invitation", async () => {
    const other = await signInAgain(leaver.email)
    ok(await rpc("Workspaces.switch", { workspaceId: shop }, other))
    const key = await keyBy(leaver.cookie)
    const tab = await socketOf(leaver.cookie)
    await until(() => tab.state.hello, "hello")

    ok(await rpc("Workspaces.leave", { workspaceId: shop }, leaver.cookie))
    await relay(shop)
    await until(() => tab.state.closed !== null, "the socket closed")
    expect(tab.state.closed).toBe(4403)
    const keys = ok(await rpc("ApiKeys.list", undefined, owner.cookie))
    expect(keys.find((k) => k.id === key)?.status).toBe("revoked")

    // The other session still pointed at the workspace left: it goes on in the person's own, and stays there.
    expect(ok(await rpc("Shell.frame", undefined, other)).workspace.id).toBe(own)
    expect(ok(await sessionMe(other)).activePrincipal?.workspaceId).toBe(own)
    expect(failure(await rpc("Workspaces.switch", { workspaceId: shop }, other))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Workspaces.switch", { workspaceId: shop }, leaver.cookie))).toMatchObject({
      _tag: "NotFound"
    })

    // Back through a new invitation: the old key stays revoked.
    await bringIn(owner.cookie, leaver, "admin")
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie)).find((k) => k.id === key)?.status).toBe("revoked")
  })

  it("keeps a removed member's keys revoked when an invitation brings them back", async () => {
    ok(await rpc("Workspaces.switch", { workspaceId: shop }, leaver.cookie))
    const key = await keyBy(leaver.cookie)
    const memberId = ok(await sessionMe(leaver.cookie)).activePrincipal!.id
    const tab = await socketOf(leaver.cookie)
    await until(() => tab.state.hello, "hello")
    ok(await rpc("Members.remove", { id: memberId }, owner.cookie))
    await pastUndo(shop)
    await relay(shop)
    await until(() => tab.state.closed !== null, "the removed member's socket closed")
    await bringIn(owner.cookie, leaver, "admin")
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie)).find((k) => k.id === key)?.status).toBe("revoked")
  })

  it("lets a member's keys work again when their removal is undone", async () => {
    ok(await rpc("Workspaces.switch", { workspaceId: shop }, leaver.cookie))
    const made = ok(
      await rpc("ApiKeys.create", {
        label: "Terug",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 90,
        ips: [],
        agent: false
      }, leaver.cookie)
    )
    const me = () => call("http://api.public.test/v1/me", { headers: { authorization: `Bearer ${made.secret}` } })
    expect((await me()).status).toBe(200)
    const memberId = ok(await sessionMe(leaver.cookie)).activePrincipal!.id
    ok(await rpc("Members.remove", { id: memberId }, owner.cookie))
    expect((await me()).status).toBe(401)
    ok(await rpc("Members.restore", { id: memberId }, owner.cookie))
    expect((await me()).status).toBe(200)
    expect(ok(await rpc("ApiKeys.list", undefined, owner.cookie)).find((k) => k.id === made.key.id)?.status).toBe(
      "active"
    )
  })
})

describe("onboarding after handing the workspace over and leaving it", () => {
  let founder = { email: "", cookie: "" }
  let heir = ""
  let workspace = "" as WorkspaceId

  beforeAll(async () => {
    founder = await person("orphan-founder", "Overgedragen Co.")
    workspace = ok(await sessionMe(founder.cookie)).principals[0]!.workspaceId
    const email = `orphan-${run}-heir@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: "all" }] }, founder.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    heir = await join(email)
  }, 120_000)

  it("reads and writes nothing there any more, and the founder can start afresh", async () => {
    expect(ok(await onboarding.me(founder.cookie))).toMatchObject({ step: "plan", completed: false })
    const heirId = ok(await sessionMe(heir)).activePrincipal!.id
    ok(await rpc("Workspaces.transferOwnership", { memberId: heirId }, founder.cookie))
    ok(await rpc("Workspaces.leave", { workspaceId: workspace }, founder.cookie))
    const before = ok(await rpc("Workspaces.list", undefined, heir))[0]!

    // Onboarding's row named the workspace: it reads as closed, and the founder is done with it.
    expect(ok(await onboarding.me(founder.cookie))).toMatchObject({ completed: true })
    ok(await onboarding.advance({ step: "plan", plan: "scale", cycle: "monthly" }, founder.cookie))
    expect(failure(await onboarding.start(founder.cookie))).toMatchObject({ _tag: "NotCurrentStep" })
    expect(failure(await onboarding.completeTask({ task: "alerts", done: true }, founder.cookie))).toMatchObject({
      _tag: "NotCurrentStep"
    })
    const after = ok(await rpc("Workspaces.list", undefined, heir))[0]!
    expect(after.plan).toBe(before.plan)
    expect(after.plan).not.toBe("scale")

    // With no workspace left, "Nieuwe werkruimte" founds another.
    expect(ok(await rpc("Workspaces.create", NEW("orphan"), founder.cookie)).landing).toBe("/onboarding")
    ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, founder.cookie))

    // Invited back into the first one, the founder's onboarding there reads as open again; the session is in the new
    // workspace, so its row is the one onboarding goes on with.
    await bringIn(heir, { email: founder.email, cookie: founder.cookie }, "admin")
    expect(ok(await onboarding.me(founder.cookie))).toMatchObject({ step: "store", completed: false })
  })

  it("is only read as closed while the founder is out: deactivated, then back, it opens where it was", async () => {
    const pioneer = await person("paused-founder", "Gepauzeerd Co.")
    const paused = ok(await sessionMe(pioneer.cookie)).principals[0]!.workspaceId
    const email = `paused-${run}-heir@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: "all" }] }, pioneer.cookie))
    await pastUndo(paused)
    await relay(paused)
    const successor = await join(email)
    ok(
      await rpc(
        "Workspaces.transferOwnership",
        { memberId: ok(await sessionMe(successor)).activePrincipal!.id },
        pioneer.cookie
      )
    )
    const pioneerId = ok(await sessionMe(pioneer.cookie)).activePrincipal!.id
    ok(await rpc("Members.deactivate", { id: pioneerId }, successor))
    expect(ok(await onboarding.me(pioneer.cookie))).toMatchObject({ completed: true })
    ok(await rpc("Members.reactivate", { id: pioneerId }, successor))
    expect(ok(await onboarding.me(pioneer.cookie))).toMatchObject({ step: "plan", completed: false })
  })
})

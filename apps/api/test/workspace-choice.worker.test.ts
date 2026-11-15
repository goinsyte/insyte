import type { WorkspaceId } from "@insyte/domain/Ids"
import { beforeAll, describe, expect, it } from "vitest"
import { cookiesOf, failure, join, ok, outboxOf, password, pastUndo, person, post, relay, run } from "./journeys.ts"
import { onboarding, rpc, sessionMe } from "./support.ts"

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

    const switched = ok(
      await rpc("Session.switchPrincipal", {
        principalId: ok(await rpc("Workspaces.list", undefined, owner.cookie)).find((w) => w.id === second)!.memberId
      }, owner.cookie)
    )
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
    const ownersMember = ok(await rpc("Workspaces.list", undefined, owner.cookie))[0]!.memberId
    expect(failure(await rpc("Session.switchPrincipal", { principalId: ownersMember }, colleague))).toMatchObject({
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
    const audit = (await outboxOf(workspace)).filter((e) =>
      e.event === "records.changed" && e.payload["kind"] === "member"
    )
    expect(audit.length).toBeGreaterThan(0)
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
  })
})

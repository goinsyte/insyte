import { describe, expect, it } from "vitest"
import { join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * The frame on the server (step 7.4, M5.3): one call for its first paint, with the workspace, the member, their role,
 * preferences and notification counts, and the team's faces; no count the server does not keep, and no proposals
 * button before Insyte drafts any.
 */
describe("the frame", () => {
  it("answers the first paint in one call, with no made-up counts", async () => {
    const owner = await person("frame-owner", "Kader B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `frame-${run}-amber@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const colleague = await join(email)
    await relay(workspace)
    ok(await rpc("Prefs.patch", { section: "rail", value: { hidden: ["/chats"] }, baseVersion: 0 }, owner.cookie))

    const frame = ok(await rpc("Shell.frame", undefined, owner.cookie))
    expect(frame.workspace).toEqual({ id: workspace, name: "Kader B.V." })
    expect(frame.me).toMatchObject({ email: owner.email })
    expect(frame.role).toMatchObject({ id: "owner" })
    expect(frame.prefs.sections["rail"]).toEqual({ value: { hidden: ["/chats"] }, version: 1 })
    expect(frame.notes).toMatchObject({ unread: 1 })
    expect(frame.teammates.map((t) => t.roleLabel).toSorted()).toEqual(["Eigenaar", "Klantenservice"])
    expect(frame.proposals).toBeNull()

    // The colleague sees the same faces, without Team's details.
    const theirs = ok(await rpc("Shell.frame", undefined, colleague))
    expect(theirs.teammates).toEqual(frame.teammates)
    expect(theirs.role).toMatchObject({ id: "service" })
    // Orders are counted (M6.4): a workspace without a store has none of any kind, which is a count, not a guess.
    expect(ok(await rpc("Nav.counts", { area: "orders" }, colleague))).toEqual({
      "/orders?status=open": 0,
      "/orders?status=processing": 0,
      "/orders?status=shipped": 0,
      "/orders?status=cancelled": 0
    })
  })
})

import { describe, expect, it } from "vitest"
import { cookiesOf, failure, mailsTo, ok, ORIGIN, password, pastUndo, person, post, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Access requests on the server (step 5.2, M3.5), through the Worker: a Klantenservice colleague asks for an area from
 * a denied state, takes it back and asks again; whoever may manage the team lists, grants (the area goes up on the
 * role, and the colleague may at once) and declines; nobody asks for what their role already has.
 */

/** A colleague in the owner's workspace, as Klantenservice, through the mailed invitation. */
const colleagueOf = async (owner: { cookie: string }, workspace: string, tag: string) => {
  const email = `access-${run}-${tag}@invited.test`
  ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner.cookie))
  await pastUndo(workspace)
  await relay(workspace)
  const url = new URL((await mailsTo(email))[0]!.url)
  const id = url.pathname.split("/").pop()!
  const k = url.searchParams.get("k")!
  await call("http://api.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-insyte-invitation": `${id}.${k}` },
    body: JSON.stringify({ name: `Collega ${tag}`, email, password })
  })
  const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
  ok(await rpc("Landing.accept", { id, k }, cookie))
  return { email, cookie }
}

describe("access requests", () => {
  let owner = { email: "", cookie: "" }
  let amber = { email: "", cookie: "" }
  let workspace = ""

  it("lets a member ask once per area, take it back, and ask again", async () => {
    owner = await person("access-owner", "Access Co.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    amber = await colleagueOf(owner, workspace, "amber")
    expect(ok(await rpc("Access.mine", undefined, amber.cookie))).toEqual([])

    const asked = ok(await rpc("Access.request", { area: "team", level: 2, path: "/settings/team" }, amber.cookie))
    expect(asked.map((r) => [r.area, r.level, r.state, r.roleLabel, r.path])).toEqual([
      ["team", 2, "open", "Klantenservice", "/settings/team"]
    ])
    // Asking again answers the open one.
    expect(ok(await rpc("Access.request", { area: "team", level: 2 }, amber.cookie))).toHaveLength(1)

    const withdrawn = ok(await rpc("Access.withdraw", { id: asked[0]!.id }, amber.cookie))
    expect(withdrawn.map((r) => r.state)).toEqual(["withdrawn"])
    const again = ok(await rpc("Access.request", { area: "team", level: 2 }, amber.cookie))
    expect(again.map((r) => r.state)).toEqual(["open", "withdrawn"])
  })

  it("refuses to ask for what the role already has, and keeps the list from those who may not manage the team", async () => {
    expect(failure(await rpc("Access.request", { area: "orders", level: 2 }, amber.cookie))).toMatchObject({
      _tag: "AlreadyAllowed"
    })
    expect(failure(await rpc("Access.request", { area: "team", level: 3 }, owner.cookie))).toMatchObject({
      _tag: "AlreadyAllowed"
    })
    expect(failure(await rpc("Access.list", undefined, amber.cookie))).toMatchObject({
      _tag: "Forbidden",
      permission: "team",
      level: 3
    })
  })

  it("grants: the area goes up on the role, and the colleague may at once", async () => {
    expect(ok(await rpc("Team.get", undefined, amber.cookie)).link.url).toBeNull()
    const open = ok(await rpc("Access.list", undefined, owner.cookie)).find((r) => r.state === "open")!
    expect(open).toMatchObject({ memberName: "Collega amber", roleLabel: "Klantenservice", area: "team", level: 2 })

    const after = ok(await rpc("Access.grant", { id: open.id }, owner.cookie))
    expect(after.find((r) => r.id === open.id)).toMatchObject({ state: "granted" })
    expect(failure(await rpc("Access.grant", { id: open.id }, owner.cookie))).toMatchObject({ _tag: "NotFound" })

    // Klantenservice now invites: the link is theirs to see, and the role says so for everyone holding it.
    ok(await rpc("InviteLink.set", { enabled: true }, owner.cookie))
    expect(ok(await rpc("Team.get", undefined, amber.cookie)).link.url).not.toBeNull()
    const service = ok(await rpc("Team.get", undefined, owner.cookie)).roles.find((r) => r.id === "service")!
    expect(service.levels["team"]).toBe(2)
    expect(failure(await rpc("Access.request", { area: "team", level: 2 }, amber.cookie))).toMatchObject({
      _tag: "AlreadyAllowed"
    })
  })

  it("declines, and the member sees the answer", async () => {
    const [asked] = ok(await rpc("Access.request", { area: "settings", level: 2 }, amber.cookie))
    ok(await rpc("Access.decline", { id: asked!.id }, owner.cookie))
    const mine = ok(await rpc("Access.mine", undefined, amber.cookie))
    expect(mine.find((r) => r.id === asked!.id)).toMatchObject({ state: "declined", area: "settings" })
    const service = ok(await rpc("Team.get", undefined, owner.cookie)).roles.find((r) => r.id === "service")!
    expect(service.levels["settings"]).toBe(0)
  })
})

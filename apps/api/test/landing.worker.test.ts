import { describe, expect, it } from "vitest"
import {
  cookiesOf,
  failure,
  mailsTo,
  ok,
  ORIGIN,
  password,
  pastUndo,
  person,
  post,
  productEventsOf,
  relay,
  run
} from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The invitation landing on the server (step 4.2, M3.4): every state the page draws, from the mailed link; signing up
 * through the invitation (admitted past the beta gate and verified by the link, so no verification mail); accepting as
 * the invitee and landing on Start; the shareable link; and the asks a dead link still allows.
 */

/** The landing's address from a captured invitation mail. */
const refOf = (url: string) => {
  const parsed = new URL(url)
  return { id: parsed.pathname.split("/").pop()!, k: parsed.searchParams.get("k")! }
}

const signUp = (email: string, name: string, proof?: string) =>
  call("http://api.test/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(proof === undefined ? {} : { "x-insyte-invitation": proof })
    },
    body: JSON.stringify({ name, email, password })
  })

const resolve = async (ref: { id: string; k?: string }, cookie?: string) =>
  ok(await rpc("Landing.resolve", ref, cookie))

describe("the invitation landing", () => {
  // Not example.com: these addresses get past the beta gate only with their invitation.
  const amber = `amber-${run}@invited.test`
  const tess = `tess-${run}@invited.test`
  let owner = { email: "", cookie: "" }
  let workspace = ""
  let amberRef = { id: "", k: "" }
  let amberCookie = ""

  it("resolves the mailed link for a new person: whose workspace, who asked, as what, and their note", async () => {
    owner = await person("landing-owner", "Landing Co.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    ok(
      await rpc("Invitations.send", {
        rows: [{ email: amber, roleId: "service", stores: "all", message: "Begin met de tickets." }]
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    amberRef = refOf((await mailsTo(amber))[0]!.url)

    const landing = await resolve(amberRef)
    expect(landing).toMatchObject({
      state: "new",
      workspace: "Landing Co.",
      inviter: { name: "Persoon landing-owner", role: "Eigenaar" },
      email: amber,
      message: "Begin met de tickets.",
      signedInAs: null,
      requested: false
    })
    expect(landing.role).toMatchObject({ id: "service", label: "Klantenservice" })
    expect(landing.role?.levels["support"]).toBe(3)
    expect(landing.at).toBeGreaterThan(Date.now())
  })

  it("is no invitation at all without its secret, or with the wrong one", async () => {
    expect((await resolve({ id: amberRef.id })).state).toBe("missing")
    // The last character changed to one it is not, whatever it was.
    const wrong = `${amberRef.k.slice(0, -1)}${amberRef.k.endsWith("x") ? "y" : "x"}`
    expect((await resolve({ id: amberRef.id, k: wrong })).state).toBe("missing")
    expect((await resolve({ id: "inv_00000000000000000000000000", k: "x" })).workspace).toBeNull()
  })

  it("keeps the beta gate shut to the address without its invitation's proof, and asks it to verify", async () => {
    const stranger = `stranger-${run}@invited.test`
    expect((await signUp(stranger, "Stranger")).status).toBe(400)
  })

  it("signs the invitee up through the link: admitted, verified by it, no verification mail, signed in at once", async () => {
    const response = await signUp(amber, "Amber Lewis", `${amberRef.id}.${amberRef.k}`)
    expect(response.status).toBe(200)
    expect((await mailsTo(amber)).map((m) => m.kind)).toEqual(["team.invite"])
    const signedIn = await post("/api/auth/sign-in/email", { email: amber, password })
    expect(signedIn.status).toBe(200)
    amberCookie = cookiesOf(signedIn)
    expect(await resolve(amberRef, amberCookie)).toMatchObject({ state: "existing", signedInAs: amber })
    // Signed out again, the landing says they have an account.
    expect((await resolve(amberRef)).state).toBe("existing")
  })

  it("tells someone else who is signed in that it is not theirs, and will not let them accept it", async () => {
    expect(await resolve(amberRef, owner.cookie)).toMatchObject({ state: "other-account", signedInAs: owner.email })
    expect(failure(await rpc("Landing.accept", amberRef, owner.cookie))).toMatchObject({
      _tag: "NotAcceptable",
      state: "other-account"
    })
  })

  it("accepts as the invitee: in the team with the invitation's role, landing on Start", async () => {
    const accepted = ok(await rpc("Landing.accept", amberRef, amberCookie))
    expect(accepted).toMatchObject({ workspaceId: workspace, workspace: "Landing Co.", landing: "/dashboard" })
    const me = ok(await sessionMe(amberCookie))
    expect(me.activePrincipal).toMatchObject({ workspaceId: workspace, roleLabel: "Klantenservice" })
    expect(me.landing).toBe("/dashboard")

    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    expect(team.members.find((m) => m.email === amber)).toMatchObject({ roleId: "service", name: "Amber Lewis" })
    expect(team.invitations.map((i) => i.email)).not.toContain(amber)
    expect(await resolve(amberRef, amberCookie)).toMatchObject({ state: "accepted" })
    expect(failure(await rpc("Landing.accept", amberRef, amberCookie))).toMatchObject({ state: "accepted" })

    await relay(workspace)
    expect((await productEventsOf(workspace)).map((e) => e.event)).toContain("invitation_accepted")
  })

  it("gives the new member their role's rights, and no more", async () => {
    const seen = ok(await rpc("Team.get", undefined, amberCookie))
    expect(seen.members).toHaveLength(2)
    // Who may not invite sees who is asked, not the links that let them in.
    expect(seen.link.url).toBeNull()
    expect(seen.invitations.every((i) => i.url === null)).toBe(true)
    expect(seen.roles.map((r) => r.id).slice(0, 1)).toEqual(["owner"])
    expect(
      failure(await rpc("Invitations.send", { rows: [{ email: tess, roleId: "view", stores: "all" }] }, amberCookie))
    ).toMatchObject({ _tag: "Forbidden", permission: "team", level: 2, roleLabel: "Klantenservice" })
  })

  it("says revoked when the invitation was withdrawn, and expired when its week is over, where one may ask again", async () => {
    const sent = ok(
      await rpc("Invitations.send", { rows: [{ email: tess, roleId: "view", stores: "all" }] }, owner.cookie)
    )
    const tessId = sent.invitations.find((i) => i.email === tess)!.id
    await pastUndo(workspace)
    await relay(workspace)
    const tessRef = refOf((await mailsTo(tess))[0]!.url)

    await call(`http://api.test/api/__dev/invitations/lapse?workspace=${workspace}&id=${tessId}`, { method: "POST" })
    expect(await resolve(tessRef)).toMatchObject({ state: "expired", requested: false })
    expect(ok(await rpc("Landing.requestNew", tessRef))).toMatchObject({ state: "expired", requested: true })
    expect(ok(await rpc("Landing.requestNew", tessRef)).requested).toBe(true)
    // A lapsed invitation is no beta pass.
    expect((await signUp(tess, "Tess", `${tessRef.id}.${tessRef.k}`)).status).toBe(400)

    ok(await rpc("Invitations.revoke", { ids: [tessId] }, owner.cookie))
    expect((await resolve(tessRef)).state).toBe("revoked")
    // A revoked one can still ask the inviter, who is never named by address.
    expect(ok(await rpc("Landing.requestNew", tessRef))).toMatchObject({ state: "revoked", requested: true })
  })

  it("lets anyone in through the shareable link while it is on, as its role, until the seats run out", async () => {
    const link = ok(await rpc("InviteLink.set", { enabled: true, roleId: "view" }, owner.cookie)).link
    const linkRef = { id: `link_${link.token}` }
    expect(await resolve(linkRef)).toMatchObject({
      state: "link",
      workspace: "Landing Co.",
      inviter: { role: "Eigenaar" },
      email: null,
      role: { id: "view" }
    })

    const joiner = await person("landing-joiner")
    const joined = ok(await rpc("Landing.accept", linkRef, joiner.cookie))
    expect(joined.landing).toBe("/dashboard")
    expect(await resolve(linkRef, joiner.cookie)).toMatchObject({ state: "accepted" })
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    expect(team.link.joined).toBe(1)
    expect(team.members.find((m) => m.email === joiner.email)?.roleId).toBe("view")

    // Five seats: three people, and two open invitations take the rest.
    ok(
      await rpc("Invitations.send", {
        rows: [1, 2].map((n) => ({ email: `seat${n}-${run}@example.com`, roleId: "view", stores: "all" as const }))
      }, owner.cookie)
    )
    expect(await resolve(linkRef)).toMatchObject({ state: "full", seats: 5 })
    const late = await person("landing-late")
    expect(failure(await rpc("Landing.accept", linkRef, late.cookie))).toMatchObject({ state: "full" })

    // Turned off, it is a dead link.
    ok(await rpc("InviteLink.set", { enabled: false }, owner.cookie))
    expect((await resolve(linkRef)).state).toBe("expired")
  })

  it("takes a removed member out of the workspace for good, until they are invited again", async () => {
    const team = ok(await rpc("Team.get", undefined, owner.cookie))
    const amberMember = team.members.find((m) => m.email === amber)!
    ok(await rpc("Members.remove", { id: amberMember.id }, owner.cookie))
    expect(ok(await sessionMe(amberCookie)).principals).toEqual([])
    expect(failure(await rpc("Team.get", undefined, amberCookie))).toMatchObject({ _tag: "NoWorkspace" })
    ok(await rpc("Members.restore", { id: amberMember.id }, owner.cookie))
    expect(ok(await sessionMe(amberCookie)).principals).toHaveLength(1)
  })
})

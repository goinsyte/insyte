import { Exit } from "effect"
import { describe, expect, it } from "vitest"
import { call, onboarding, sessionMe } from "./support.ts"

/*
 * The onboarding machine through the Worker (step 2, M4.1): a new person starts at the role, choosing "admin" moves
 * them to the organisation step, and every later read, from this browser or another, resumes there. Only the current
 * step can be finished; signed out, there is no onboarding to read.
 */

const ORIGIN = "http://localhost:4300"
const email = `onboarding-${Date.now().toString(36)}@example.com`
const password = "correct-horse-battery"

const post = (path: string, body: unknown) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body)
  })

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

const signIn = async () => cookiesOf(await post("/api/auth/sign-in/email", { email, password }))

const valueOf = <A>(exit: Exit.Exit<A, unknown>): A => {
  if (Exit.isFailure(exit)) throw new Error(JSON.stringify(exit.cause))
  return exit.value
}

describe("the onboarding machine", () => {
  let cookie = ""

  it("starts a newly verified person at the role step", async () => {
    expect((await post("/api/auth/sign-up/email", { name: "Nieuw", email, password })).status).toBe(200)
    const { mails } = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
      mails: Array<{ url: string }>
    }
    const verify = new URL(mails[0]!.url)
    await call(`http://api.test${verify.pathname}${verify.search}`, { redirect: "manual" })
    cookie = await signIn()
    expect(valueOf(await onboarding.me(cookie))).toMatchObject({ track: "admin", step: "role", index: 2, total: 10 })
  })

  it("refuses to finish a step that is not the current one", async () => {
    const stale = await onboarding.advance({ step: "account" }, cookie)
    expect(Exit.isFailure(stale) && JSON.stringify(stale.cause)).toContain("NotCurrentStep")
  })

  it("moves an admin to the organisation step, and resumes there in another browser", async () => {
    expect(valueOf(await onboarding.advance({ step: "role", persona: "admin" }, cookie))).toMatchObject({
      track: "admin",
      step: "organization",
      answers: { persona: "admin" },
      index: 3
    })
    const elsewhere = await signIn()
    expect(valueOf(await onboarding.me(elsewhere))).toMatchObject({ step: "organization", index: 3 })
  })

  it("founds the workspace at the organisation step, with the person as owner, and moves on to the plan", async () => {
    const slug = `ws-${Date.now().toString(36)}`
    expect(
      valueOf(
        await onboarding.advance(
          { step: "organization", name: "Allure Co.", slug, country: "NL", teamSize: "2-5" },
          cookie
        )
      )
    ).toMatchObject({ step: "plan", index: 4 })
    expect(valueOf(await onboarding.me(await signIn()))).toMatchObject({ step: "plan" })
    const me = valueOf(await sessionMe(cookie))
    expect(me.principals).toEqual([
      expect.objectContaining({ kind: "member", workspaceName: "Allure Co.", roleLabel: "Eigenaar" })
    ])
    expect(me.activePrincipal).toEqual(me.principals[0])
  })

  it("refuses a slug that is taken, and an empty name, by field, and founds nothing", async () => {
    const other = `other-${Date.now().toString(36)}@example.com`
    expect((await post("/api/auth/sign-up/email", { name: "Ander", email: other, password })).status).toBe(200)
    const { mails } = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(other)}`)).json() as {
      mails: Array<{ url: string }>
    }
    const verify = new URL(mails[0]!.url)
    await call(`http://api.test${verify.pathname}${verify.search}`, { redirect: "manual" })
    const theirs = cookiesOf(await post("/api/auth/sign-in/email", { email: other, password }))
    valueOf(await onboarding.advance({ step: "role", persona: "admin" }, theirs))
    // Unique per run: the compose database keeps every run's workspaces.
    const contested = `taken-${Date.now().toString(36)}`

    const taken = await onboarding.advance({
      step: "organization",
      name: "Kopie",
      slug: contested,
      country: "NL",
      teamSize: "1"
    }, theirs)
    expect(Exit.isSuccess(taken)).toBe(true) // first claim of this slug
    const again = `again-${Date.now().toString(36)}@example.com`
    expect((await post("/api/auth/sign-up/email", { name: "Nog een", email: again, password })).status).toBe(200)
    const second = (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(again)}`)).json()) as {
      mails: Array<{ url: string }>
    }
    const link = new URL(second.mails[0]!.url)
    await call(`http://api.test${link.pathname}${link.search}`, { redirect: "manual" })
    const third = cookiesOf(await post("/api/auth/sign-in/email", { email: again, password }))
    valueOf(await onboarding.advance({ step: "role", persona: "admin" }, third))
    const clash = await onboarding.advance({
      step: "organization",
      name: "Kopie",
      slug: contested,
      country: "NL",
      teamSize: "1"
    }, third)
    expect(Exit.isFailure(clash) && JSON.stringify(clash.cause)).toContain(`"slug":"taken"`)
    const empty = await onboarding.advance({
      step: "organization",
      name: " ",
      slug: `${contested}-x`,
      country: "NL",
      teamSize: "1"
    }, third)
    expect(Exit.isFailure(empty) && JSON.stringify(empty.cause)).toContain(`"name":"required"`)
    // Nothing half-written: still at the organisation step, with no workspace.
    expect(valueOf(await onboarding.me(third))).toMatchObject({ step: "organization" })
    expect(valueOf(await sessionMe(third)).principals).toEqual([])
  })

  it("is not there to read when signed out", async () => {
    const signedOut = await onboarding.me()
    expect(Exit.isFailure(signedOut) && JSON.stringify(signedOut.cause)).toContain("Unauthenticated")
  })
})

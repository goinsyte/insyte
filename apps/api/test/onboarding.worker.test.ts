import { Exit } from "effect"
import { describe, expect, it } from "vitest"
import { call, onboarding } from "./support.ts"

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

  it("is not there to read when signed out", async () => {
    const signedOut = await onboarding.me()
    expect(Exit.isFailure(signedOut) && JSON.stringify(signedOut.cause)).toContain("Unauthenticated")
  })
})

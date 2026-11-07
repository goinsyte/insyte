import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * better-auth through the Worker (M2.1): sign up, the verification mail captured, verify, sign in, the session, sign
 * out. Against the compose database, like every worker test. Each run signs up a new address.
 */

const ORIGIN = "http://localhost:4300"
const email = `auth-${Date.now().toString(36)}@example.com`
const password = "correct-horse-battery"

const post = (path: string, body: unknown, cookie?: string) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify(body)
  })

/** The `name=value` pairs of a response's cookies, for the next request. */
const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

const sessionCookie = (response: Response) =>
  response.headers.getSetCookie().find((c) => c.startsWith("insyte.session="))

describe("better-auth on the API Worker", () => {
  let verifyPath = ""
  let cookie = ""

  it("signs a new address up, unverified, and sends the verification mail", async () => {
    const response = await post("/api/auth/sign-up/email", { name: "Probe", email, password })
    expect(response.status).toBe(200)
    const body = await response.json() as { user: { id: string; emailVerified: boolean } }
    expect(body.user.id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/)
    expect(body.user.emailVerified).toBe(false)

    const mail = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
      mails: Array<{ kind: string; url: string }>
    }
    expect(mail.mails[0]?.kind).toBe("auth.verify")
    const url = new URL(mail.mails[0]!.url)
    expect(url.origin).toBe(ORIGIN)
    verifyPath = `${url.pathname}${url.search}`
  })

  it("refuses to sign in before the address is verified", async () => {
    const response = await post("/api/auth/sign-in/email", { email, password })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" })
  })

  it("verifies the address from the mail's link and signs in", async () => {
    const response = await call(`http://api.test${verifyPath}`, { redirect: "manual" })
    expect(response.status).toBe(302)
    expect(sessionCookie(response)).toBeDefined()
  })

  it("signs in with the password and sets a host-only session cookie", async () => {
    const response = await post("/api/auth/sign-in/email", { email, password })
    expect(response.status).toBe(200)
    const set = sessionCookie(response)!
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).toMatch(/Path=\//i)
    // Host-only: no Domain, so the session never reaches another subdomain (ADR-0038).
    expect(set).not.toMatch(/Domain=/i)
    cookie = cookiesOf(response)
  })

  it("reads the session back, verified", async () => {
    const response = await call("http://api.test/api/auth/get-session", { headers: { cookie } })
    const session = await response.json() as {
      user: { email: string; emailVerified: boolean }
      session: { id: string }
    }
    expect(session.user).toMatchObject({ email, emailVerified: true })
    expect(session.session.id).toMatch(/^ses_/)
  })

  it("refuses a wrong password without saying which part was wrong", async () => {
    const response = await post("/api/auth/sign-in/email", { email, password: "not-the-password" })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" })
  })

  it("refuses a cross-origin POST (CSRF)", async () => {
    const response = await call("http://api.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    expect(response.status).toBe(403)
  })

  it("signs out: the cookies are cleared and the session row is gone", async () => {
    const response = await post("/api/auth/sign-out", {}, cookie)
    expect(response.status).toBe(200)
    expect(sessionCookie(response)).toMatch(/Max-Age=0/i)
    // The session token alone, without better-auth's 5-minute cache cookie: the row itself must be gone. (A replayed
    // cache cookie still validates until it expires; our own session check reads the row, 12 §5.)
    const token = cookie.split("; ").find((c) => c.startsWith("insyte.session="))!
    const after = await call("http://api.test/api/auth/get-session", { headers: { cookie: token } })
    expect(await after.json()).toBeNull()
  })

  it("sends a reset mail, and a new password works once", async () => {
    expect((await post("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" })).status).toBe(200)
    const mail = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
      mails: Array<{ kind: string; url: string }>
    }
    const reset = mail.mails.find((m) => m.kind === "auth.reset")!
    const follow = await call(`http://api.test${new URL(reset.url).pathname}${new URL(reset.url).search}`, {
      redirect: "manual"
    })
    const token = new URL(follow.headers.get("location")!, ORIGIN).searchParams.get("token")!
    expect((await post("/api/auth/reset-password", { token, newPassword: "a-brand-new-password" })).status).toBe(200)
    expect((await post("/api/auth/reset-password", { token, newPassword: "and-once-more-please" })).status).toBe(400)
    expect((await post("/api/auth/sign-in/email", { email, password: "a-brand-new-password" })).status).toBe(200)
  })
})

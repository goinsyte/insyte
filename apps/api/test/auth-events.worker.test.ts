import { describe, expect, it } from "vitest"
import { call } from "./support.ts"
import { secretOf, totp } from "./totp.ts"

/*
 * `auth_events` (M2.6) through the Worker: one account taken through every kind of event, then its log read back in
 * order. An unknown address leaves no trace, and the visitor's answers are the same as without the log.
 */

const ORIGIN = "http://localhost:4300"
const run = Date.now().toString(36)
const email = `events-${run}@example.com`
const password = "correct-horse-battery"
const next = "a-brand-new-password"

const post = (path: string, body: unknown, cookie = "") =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      "cf-ipcountry": "NL",
      ...(cookie === "" ? {} : { cookie })
    },
    body: JSON.stringify(body)
  })

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

const mailTo = async (address: string, kind: string) => {
  const { mails } = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(address)}`)).json() as {
    mails: Array<{ kind: string; url: string }>
  }
  const url = new URL(mails.find((m) => m.kind === kind)!.url)
  return `${url.pathname}${url.search}`
}

const eventsOf = async (address: string) =>
  ((await (await call(`http://api.test/api/__dev/auth-events?email=${encodeURIComponent(address)}`)).json()) as {
    events: Array<{ kind: string; country: string | null }>
  }).events

describe("auth_events", () => {
  it("records each thing that happens to an account, in order", async () => {
    expect((await post("/api/auth/sign-up/email", { name: "Log", email, password })).status).toBe(200)
    await call(`http://api.test${await mailTo(email, "auth.verify")}`, { redirect: "manual" })
    expect((await post("/api/auth/sign-in/email", { email, password: "wrong-password" })).status).toBe(401)
    let cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))

    const enabled = await (await post("/api/auth/two-factor/enable", { password }, cookie)).json() as {
      totpURI: string
    }
    const confirmed = await post(
      "/api/auth/two-factor/verify-totp",
      { code: await totp(secretOf(enabled.totpURI)) },
      cookie
    )
    expect(confirmed.status).toBe(200)
    // Confirming the enrolment issues a fresh session cookie.
    cookie = cookiesOf(confirmed) || cookie
    expect((await post("/api/auth/two-factor/disable", { password }, cookie)).status).toBe(200)
    expect((await post("/api/auth/sign-out", {}, cookie)).status).toBe(200)

    expect((await post("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" })).status).toBe(200)
    const follow = await call(`http://api.test${await mailTo(email, "auth.reset")}`, { redirect: "manual" })
    const token = new URL(follow.headers.get("location")!, ORIGIN).searchParams.get("token")!
    expect((await post("/api/auth/reset-password", { token, newPassword: next })).status).toBe(200)

    const events = await eventsOf(email)
    expect(events.map((e) => e.kind)).toEqual([
      "sign_up",
      "sign_in", // the verification link signs in
      "sign_in_failed",
      "sign_in",
      "two_factor_enabled",
      "two_factor_disabled",
      "sign_out",
      "password_reset_requested",
      "password_changed"
    ])
    expect(events.find((e) => e.kind === "sign_in_failed")?.country).toBe("NL")
  })

  it("records nothing for an address without an account, and answers it as before", async () => {
    const stranger = `nobody-${run}@example.com`
    expect((await post("/api/auth/sign-in/email", { email: stranger, password })).status).toBe(401)
    expect((await post("/api/auth/request-password-reset", { email: stranger, redirectTo: "/reset-password" })).status)
      .toBe(200)
    expect(await eventsOf(stranger)).toEqual([])
  })
})

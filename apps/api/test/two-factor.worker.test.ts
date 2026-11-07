import { describe, expect, it } from "vitest"
import { call, sessionMe } from "./support.ts"
import { secretOf, totp } from "./totp.ts"

/*
 * Two-factor sign-in (M2) through the Worker: enrol with the password, confirm with a first code, and from then on
 * sign-in stops after the password (`twoFactorRedirect`, a `two_factor` cookie, no session) until a TOTP or a backup
 * code is given. Enrolment's screen is the security settings page (M3); here it is the API alone.
 */

const ORIGIN = "http://localhost:4300"
const email = `tfa-${Date.now().toString(36)}@example.com`
const password = "correct-horse-battery"

const post = (path: string, body: unknown, cookie = "") =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
    body: JSON.stringify(body)
  })

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
/** A session cookie with a value: sign-in that pauses for the code also sends one, cleared (`insyte.session=; Max-Age=0`). */
const hasSession = (response: Response) => response.headers.getSetCookie().some((c) => /^insyte\.session=[^;]+/.test(c))

describe("two-factor sign-in", () => {
  let secret = ""
  let backupCodes: ReadonlyArray<string> = []
  let cookie = ""

  it("enrols a verified, signed-in account and confirms it with a first code", async () => {
    expect((await post("/api/auth/sign-up/email", { name: "Twee", email, password })).status).toBe(200)
    const mail = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
      mails: Array<{ url: string }>
    }
    const verify = new URL(mail.mails[0]!.url)
    await call(`http://api.test${verify.pathname}${verify.search}`, { redirect: "manual" })
    cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))

    const enabled = await post("/api/auth/two-factor/enable", { password }, cookie)
    expect(enabled.status).toBe(200)
    const body = await enabled.json() as { totpURI: string; backupCodes: Array<string> }
    expect(body.totpURI).toMatch(/^otpauth:\/\/totp\/Insyte:/)
    expect(body.backupCodes.length).toBeGreaterThanOrEqual(5)
    secret = secretOf(body.totpURI)
    backupCodes = body.backupCodes

    const confirmed = await post("/api/auth/two-factor/verify-totp", { code: await totp(secret) }, cookie)
    expect(confirmed.status).toBe(200)
    cookie = cookiesOf(confirmed) || cookie
    const me = await sessionMe(cookie)
    expect(me._tag === "Success" && me.value.user.twoFactorEnabled).toBe(true)
  })

  it("stops sign-in after the password, without a session, until a code is given", async () => {
    const signIn = await post("/api/auth/sign-in/email", { email, password })
    expect(signIn.status).toBe(200)
    expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true })
    expect(hasSession(signIn)).toBe(false)
    const pending = cookiesOf(signIn)
    expect(pending).toMatch(/insyte\.two_factor=/)

    expect((await post("/api/auth/two-factor/verify-totp", { code: "000000" }, pending)).status).toBe(401)
    // The next window's code: the first one was spent confirming the enrolment.
    const verified = await post(
      "/api/auth/two-factor/verify-totp",
      { code: await totp(secret, Date.now() + 30_000) },
      pending
    )
    expect(verified.status).toBe(200)
    expect(hasSession(verified)).toBe(true)
  })

  it("accepts a backup code once, and only once", async () => {
    const first = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
    const used = await post("/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] }, first)
    expect(used.status).toBe(200)
    expect(hasSession(used)).toBe(true)

    const again = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
    expect((await post("/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] }, again)).status).toBe(401)
  })
})

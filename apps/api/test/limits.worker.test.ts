import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * The edge guards (M2.3) through the Worker, with the `RateLimiter` Durable Object in workerd: an address locks after
 * five failed sign-ins, and stays locked for the right password too; sign-ins and sign-ups per IP; reset and
 * verification mails per address; the body cap. Every test uses its own addresses and IPs, so none shares a counter.
 */

const ORIGIN = "http://localhost:4300"
const run = Date.now().toString(36)

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  })

const refusedWith = async (response: Response) => {
  expect(response.status).toBe(429)
  const body = await response.json() as { code: string; retryAfterSeconds: number }
  expect(body.code).toBe("RATE_LIMITED")
  expect(Number(response.headers.get("retry-after"))).toBe(body.retryAfterSeconds)
  return body.retryAfterSeconds
}

describe("the edge guards", () => {
  it("lock an address after five failed sign-ins, for fifteen minutes, whatever the password", async () => {
    const email = `locked-${run}@example.com`
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await post("/api/auth/sign-in/email", { email, password: `wrong-${attempt}` })).status).toBe(401)
    }
    const wait = await refusedWith(await post("/api/auth/sign-in/email", { email, password: "wrong-6" }))
    expect(wait).toBeGreaterThan(14 * 60)
    expect(wait).toBeLessThanOrEqual(15 * 60)
    // The address, not the casing: the same mailbox written differently is the same lock.
    await refusedWith(await post("/api/auth/sign-in/email", { email: email.toUpperCase(), password: "x" }))
  })

  it("count sign-ins per IP: the 21st in fifteen minutes is refused", async () => {
    const headers = { "cf-connecting-ip": `203.0.113.${Number.parseInt(run.slice(-2), 36) % 250}` }
    for (let attempt = 1; attempt <= 20; attempt++) {
      const response = await post("/api/auth/sign-in/email", {
        email: `ip-${run}-${attempt}@example.com`,
        password: "x"
      }, headers)
      expect(response.status).toBe(401)
    }
    await refusedWith(
      await post("/api/auth/sign-in/email", { email: `ip-${run}-21@example.com`, password: "x" }, headers)
    )
  })

  it("count sign-ups per IP: the 11th in an hour is refused", async () => {
    const headers = { "cf-connecting-ip": `198.51.100.${Number.parseInt(run.slice(-2), 36) % 250}` }
    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await post(
        "/api/auth/sign-up/email",
        { name: "Limiet", email: `signup-${run}-${attempt}@example.com`, password: "correct-horse-battery" },
        headers
      )
      expect(response.status).toBe(200)
    }
    await refusedWith(
      await post(
        "/api/auth/sign-up/email",
        { name: "Limiet", email: `signup-${run}-11@example.com`, password: "correct-horse-battery" },
        headers
      )
    )
  })

  it("send at most three reset mails an hour to one address, the same for an address with no account", async () => {
    const email = `nobody-${run}@example.com`
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await post("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" })).status).toBe(
        200
      )
    }
    await refusedWith(await post("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" }))
  })

  it("send at most three verification mails an hour to one address", async () => {
    const email = `resend-${run}@example.com`
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await post("/api/auth/send-verification-email", { email, callbackURL: "/onboarding" })).status).toBe(200)
    }
    await refusedWith(await post("/api/auth/send-verification-email", { email, callbackURL: "/onboarding" }))
  })

  it("refuse a body over 16 KiB before better-auth reads it", async () => {
    const response = await post("/api/auth/sign-in/email", { email: "x@example.com", password: "p".repeat(20_000) })
    expect(response.status).toBe(413)
  })
})

describe("the beta gate", () => {
  it("refuses an address that is neither admitted nor on the allowlist, and sends it nothing", async () => {
    const email = `outsider-${run}@example.org`
    const response = await post("/api/auth/sign-up/email", { name: "Buiten", email, password: "correct-horse-battery" })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "BETA_CLOSED" })
    const mail = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
      mails: ReadonlyArray<unknown>
    }
    expect(mail.mails).toEqual([])
  })

  it("admits an address on the stage's admitted domain", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Binnen",
      email: `insider-${run}@example.com`,
      password: "correct-horse-battery"
    })
    expect(response.status).toBe(200)
  })
})

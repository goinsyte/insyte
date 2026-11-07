import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * Turnstile in the edge guards (M2.2), on a Worker that has a secret (`vitest.configured.config.ts`): sign-up and a
 * reset request always ask for it; sign-in asks once the address is warm, after three failures.
 */

const ORIGIN = "http://localhost:4300"
const run = Date.now().toString(36)

const post = (path: string, body: unknown) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body)
  })

const humanCheckAsked = async (response: Response) => {
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: "TURNSTILE_REQUIRED" })
}

describe("Turnstile", () => {
  it("is asked for on sign-up", async () => {
    await humanCheckAsked(
      await post("/api/auth/sign-up/email", {
        name: "Mens",
        email: `human-${run}@example.com`,
        password: "correct-horse-battery"
      })
    )
  })

  it("is asked for on a reset request", async () => {
    await humanCheckAsked(
      await post("/api/auth/request-password-reset", {
        email: `human-${run}@example.com`,
        redirectTo: "/reset-password"
      })
    )
  })

  it("is not asked for on a first sign-in, and is after three failures", async () => {
    const email = `warm-${run}@example.com`
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await post("/api/auth/sign-in/email", { email, password: `wrong-${attempt}` })).status).toBe(401)
    }
    await humanCheckAsked(await post("/api/auth/sign-in/email", { email, password: "wrong-4" }))
  })
})

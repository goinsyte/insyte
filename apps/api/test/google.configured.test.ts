import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * "Doorgaan met Google" (M2.5) on a Worker with a Google client (`vitest.configured.config.ts`): the hand-off to Google
 * names our client, our callback and the account chooser; a return that did not start here is refused onto our sign-in
 * screen. What Google itself answers is not tested here: there is no Google in workerd.
 */

const ORIGIN = "http://localhost:4300"

describe("Google sign-in", () => {
  it("is offered in the public config", async () => {
    const config = await (await call("http://api.test/api/config")).json() as { signInProviders: Array<string> }
    expect(config.signInProviders).toEqual(["password", "google"])
  })

  it("hands off to Google with our client, our callback and the account chooser", async () => {
    const response = await call("http://api.test/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" })
    })
    expect(response.status).toBe(200)
    const { url } = await response.json() as { url: string }
    const google = new URL(url)
    expect(google.origin).toBe("https://accounts.google.com")
    expect(google.searchParams.get("client_id")).toBe("insyte-test.apps.googleusercontent.com")
    expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`)
    expect(google.searchParams.get("prompt")).toBe("select_account")
    expect(google.searchParams.get("scope")).toContain("email")
    expect(google.searchParams.get("state")).toBeTruthy()
  })

  it("refuses a return with a forged state, onto our sign-in screen with the reason", async () => {
    const response = await call("http://api.test/api/auth/callback/google?code=forged&state=forged", {
      redirect: "manual"
    })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("location")!)
    expect(`${location.origin}${location.pathname}`).toBe(`${ORIGIN}/login`)
    expect(location.searchParams.get("error")).toBeTruthy()
  })
})

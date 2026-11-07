import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/* Where the stage has no Google client (previews, local): password only, and asking for Google is refused. */
describe("Google sign-in, unconfigured", () => {
  it("is not offered, and is refused when asked for", async () => {
    const config = await (await call("http://api.test/api/config")).json() as { signInProviders: Array<string> }
    expect(config.signInProviders).toEqual(["password"])
    const response = await call("http://api.test/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: "http://localhost:4300", "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" })
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await response.json()).toMatchObject({ code: "PROVIDER_NOT_FOUND" })
  })
})

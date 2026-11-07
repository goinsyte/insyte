import { describe, expect, it } from "vitest"
import { verifyTurnstile } from "../src/Turnstile.ts"

const answering = (body: unknown, seen: Array<FormData> = [], status = 200): typeof fetch =>
  ((_: RequestInfo | URL, init?: RequestInit) => {
    seen.push(init?.body as FormData)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch

describe("verifyTurnstile", () => {
  it("sends the secret, the token and the visitor's IP, and passes on Cloudflare's success", async () => {
    const seen: Array<FormData> = []
    const result = await verifyTurnstile(
      { secret: "s3cret", token: "tok", remoteIp: "203.0.113.9" },
      answering({ success: true }, seen)
    )
    expect(result).toEqual({ success: true, errors: [] })
    expect(seen[0]?.get("secret")).toBe("s3cret")
    expect(seen[0]?.get("response")).toBe("tok")
    expect(seen[0]?.get("remoteip")).toBe("203.0.113.9")
  })

  it("refuses what Cloudflare refuses, with its reasons", async () => {
    expect(
      await verifyTurnstile(
        { secret: "s", token: "t" },
        answering({ success: false, "error-codes": ["timeout-or-duplicate"] })
      )
    )
      .toEqual({ success: false, errors: ["timeout-or-duplicate"] })
  })

  it("fails closed: no token, an error status, or no answer", async () => {
    let called = false
    const never = (() => {
      called = true
      return Promise.reject(new Error("offline"))
    }) as typeof fetch
    expect((await verifyTurnstile({ secret: "s", token: "" }, never)).success).toBe(false)
    expect(called).toBe(false)
    expect((await verifyTurnstile({ secret: "s", token: "t" }, answering({}, [], 500))).success).toBe(false)
    expect((await verifyTurnstile({ secret: "s", token: "t" }, never)).success).toBe(false)
  })
})

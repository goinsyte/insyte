import { describe, expect, it } from "vitest"
import { newNonce, securityHeaders } from "../src/security-headers.ts"

/* The console's security headers (08 §6, M18): what a page is sent with, deployed and under `vite dev`. */

const directives = (policy: string) =>
  Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0]!, d.split(" ").slice(1)]))

describe("the console's security headers", () => {
  it("runs inline script only with the page's nonce, and Turnstile's script from its origin", () => {
    const csp = directives(securityHeaders({ nonce: "abc123", environment: "production" })["content-security-policy"]!)
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc123'", "https://challenges.cloudflare.com"])
    expect(csp["script-src"]).not.toContain("'unsafe-inline'")
    expect(csp["script-src"]).not.toContain("'unsafe-eval'")
    expect(csp["frame-ancestors"]).toEqual(["'none'"])
    expect(csp["object-src"]).toEqual(["'none'"])
    expect(csp["connect-src"]).toEqual(["'self'", "https://*.ingest.de.sentry.io", "https://challenges.cloudflare.com"])
    expect(csp["img-src"]).not.toContain("https://images.unsplash.com")
  })

  it("keeps the transport and framing headers on every page", () => {
    const headers = securityHeaders({ nonce: "n", environment: "staging" })
    expect(headers).toMatchObject({
      "strict-transport-security": "max-age=63072000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin"
    })
    expect(headers["permissions-policy"]).toContain("camera=()")
    expect(directives(headers["content-security-policy"]!)["img-src"]).toContain("https://images.unsplash.com")
  })

  it("falls back to inline scripts only without a nonce, as under vite dev", () => {
    const csp = directives(securityHeaders({ nonce: undefined, environment: "local" })["content-security-policy"]!)
    expect(csp["script-src"]).toContain("'unsafe-inline'")
  })

  it("draws a fresh 128-bit nonce each time", () => {
    const a = newNonce()
    expect(atob(a)).toHaveLength(16)
    expect(newNonce()).not.toBe(a)
  })
})

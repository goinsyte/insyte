import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { env } from "cloudflare:workers"

/*
 * The console Worker's entry (11 §3). `/api/*` (RPC, later better-auth and the realtime upgrade) goes to the API
 * Worker by service binding before Start runs, with its headers intact (`traceparent` and `baggage` included, so the
 * browser, the API and the SQL are one trace). Everything else is a server render, sent with the security headers.
 */

const start = createStartHandler(defaultStreamHandler)

/** 08 §6. `script-src 'self'` holds because Start's hydration script is served from the origin. */
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "),
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()"
}

const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/")

export default {
  async fetch(request: Request): Promise<Response> {
    if (isApi(new URL(request.url).pathname)) return env.API.fetch(request)
    const response = await start(request)
    const secured = new Response(response.body, response)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value)
    // A page holds the visitor's data: never cached by anyone in between.
    if (!secured.headers.has("cache-control")) secured.headers.set("cache-control", "private, no-store")
    return secured
  }
}

import { CONSOLE_ROUTES, safeRedirect } from "@insyte/domain/Redirect"
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { env } from "cloudflare:workers"
import { newNonce, securityHeaders } from "./security-headers.ts"

/*
 * The console Worker's entry (11 §3). `/api/*` (RPC, later better-auth and the realtime upgrade) goes to the API
 * Worker by service binding before Start runs, with its headers intact (`traceparent` and `baggage` included, so the
 * browser, the API and the SQL are one trace). Everything else is a server render, sent with the security headers.
 */

const start = createStartHandler(defaultStreamHandler)

const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/")

/** Reached before an account exists: the first onboarding steps and an invitation's landing (M2.4). */
const OPEN_ROUTES = new Set(["onboarding", "invitations"])

/** better-auth's session cookie: `__Secure-` on https, plain on local http. */
const hasSessionCookie = (request: Request) =>
  /(?:^|;\s*)(?:__Secure-)?insyte\.session=/.test(request.headers.get("cookie") ?? "")

/**
 * The session gate (ADR-0028, M2.4): a signed-out visitor asking for an app route goes to sign-in before any HTML,
 * with where they were going as a safe `redirect`. Only the cookie's presence is checked here; the API checks that it
 * is valid on the first RPC, and the client gate handles an expired one.
 */
const signInFirst = (request: Request): Response | undefined => {
  const url = new URL(request.url)
  const first = url.pathname.split("/")[1] ?? ""
  const isAppRoute = (CONSOLE_ROUTES as ReadonlyArray<string>).includes(first) && !OPEN_ROUTES.has(first)
  if (request.method !== "GET" || !isAppRoute || hasSessionCookie(request)) return undefined
  const login = new URL("/login", url)
  const back = safeRedirect(`${url.pathname}${url.search}`)
  if (back !== undefined) login.searchParams.set("redirect", back)
  return new Response(null, { status: 302, headers: { location: `${login.pathname}${login.search}` } })
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (isApi(new URL(request.url).pathname)) return env.API.fetch(request)
    // One nonce per page for Start's inline scripts (`router.tsx` hands it to the router); none under `vite dev`.
    const nonce = import.meta.env.DEV ? undefined : newNonce()
    const response = signInFirst(request) ??
      await start(request, nonce === undefined ? undefined : { context: { nonce } })
    const secured = new Response(response.body, response)
    for (const [name, value] of Object.entries(securityHeaders({ nonce, environment: env.ENVIRONMENT }))) {
      secured.headers.set(name, value)
    }
    // A page holds the visitor's data: never cached by anyone in between.
    if (!secured.headers.has("cache-control")) secured.headers.set("cache-control", "private, no-store")
    return secured
  }
}

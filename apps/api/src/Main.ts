import { env, tracing } from "cloudflare:workers"
import { HttpRouter } from "effect/http"
import { AppLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import { Telemetry } from "./platform/Observability.ts"

/*
 * The API Worker, `insyte-api` (ADR-0041): the HTTP app and inbound mail. The queue consumers, the cron, the Workflows,
 * the realtime rooms and the connection gate run in the jobs Worker (`Jobs.ts`), reached through cross-script bindings.
 */

// The Durable Object classes this Worker hosts; infra and `wrangler.jsonc` bind them by these names.
export { RateLimiter } from "./platform/RateLimiter.ts"
// The live room per workspace (M14 step 3): storefront visitors in memory.
export { LiveRoomDurableObject } from "./platform/LiveRoom.ts"

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(AppLayer)

export default {
  async fetch(request, _env, ctx) {
    if (!servedHere(request)) return Response.json({ error: { code: "not_found" } }, { status: 404 })
    const response = await web.handler(continueTrace(request))
    ctx.waitUntil(Telemetry.flush()) // spans leave after the response is out (17 §1)
    return response
  },
  // A support mail (M11 step 1): its handler and the background layer load on the first one, not at startup.
  email: (message, bindings, ctx) =>
    import("./transports/email/Email.ts").then(({ email }) => email(message, bindings, ctx))
} satisfies ExportedHandler<Env>

/**
 * On the Worker's own public hostname only the public API, the MCP server and the webhooks answer (M19.2, M19.3,
 * M6.3, M8.3, M8.4): `/v1`, `/mcp`, `/hooks/shopify`, `/hooks/aftership` and `/hooks/supplier/:id`; and the
 * storefront's Web Pixel, `/api/public/pixel/:storeId` (M14 step 3). Everything else (auth, the RPC, the dev routes) is reached through the console's service binding, on the
 * console's origin.
 */
const servedHere = (request: Request): boolean => {
  const url = new URL(request.url)
  if (env.PUBLIC_API_HOST === undefined || url.host !== env.PUBLIC_API_HOST) return true
  return url.pathname === "/mcp" || url.pathname === "/v1" || url.pathname.startsWith("/v1/") ||
    url.pathname === "/hooks/shopify" || url.pathname === "/hooks/aftership" ||
    url.pathname.startsWith("/hooks/supplier/") || url.pathname.startsWith("/api/public/pixel/")
}

/**
 * Which trace a request joins. Effect reads `traceparent` itself; this only decides which one it sees (17 §1). A
 * request that brings one (the console, through Sentry's SDK) continues it, and Cloudflare's root span gets
 * `insyte.trace_id` so its platform spans can be found. One without (webhooks, the public API, MCP) is parented on
 * Cloudflare's own span, so Effect's spans and Cloudflare's land in one trace.
 */
const continueTrace = (request: Request): Request => {
  const root = tracing.getActiveSpan()
  const incoming = request.headers.get("traceparent")
  if (incoming !== null) {
    root?.setAttribute("insyte.trace_id", incoming.split("-")[1] ?? "")
    return request
  }
  const own = root?.spanContext()
  if (own === undefined || /^0+$/.test(own.traceId)) return request // observability off: all zeros
  const headers = new Headers(request.headers)
  headers.set("traceparent", `00-${own.traceId}-${own.spanId}-01`)
  return new Request(request, { headers })
}

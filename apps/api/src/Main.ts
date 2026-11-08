import { env, tracing } from "cloudflare:workers"
import { ManagedRuntime } from "effect"
import { HttpRouter } from "effect/http"
import { AppLayer, BackgroundLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import { Telemetry } from "./platform/Observability.ts"
import { deliver, type EventsMessage, sweep } from "./platform/Relay.ts"
import { withRequestDb } from "./platform/RequestDb.ts"

// The Durable Object classes this Worker hosts; infra and `wrangler.jsonc` bind them by these names.
export { RateLimiter } from "./platform/RateLimiter.ts"
export { RoomDurableObject } from "./platform/Room.ts"
// The gate per external account (M6.3), and the store backfill's Workflow.
export { ConnectionGateObject } from "./platform/ConnectionGate.ts"
export { ShopifyBackfillWorkflow } from "./workflows/ShopifyBackfill.ts"

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(AppLayer)

/** The queue consumer's and the cron's runtime: built once per isolate too, without the routes. */
const background = ManagedRuntime.make(BackgroundLayer)

export default {
  async fetch(request, _env, ctx) {
    if (!servedHere(request)) return Response.json({ error: { code: "not_found" } }, { status: 404 })
    const response = await web.handler(continueTrace(request))
    ctx.waitUntil(Telemetry.flush()) // spans leave after the response is out (17 §1)
    return response
  },

  /** The outbox relay's consumer (M1.4). A throw leaves the batch to the queue's retries, then its dead letters. */
  async queue(batch, _env, ctx) {
    try {
      await background.runPromise(withRequestDb(deliver(batch.messages.flatMap((m) => m.body.outboxIds))))
      batch.ackAll()
    } finally {
      ctx.waitUntil(Telemetry.flush())
    }
  },

  /** Every minute: the relay's sweep for events a kick missed. */
  scheduled(_controller, _env, ctx) {
    ctx.waitUntil(background.runPromise(withRequestDb(sweep())).finally(() => Telemetry.flush()))
  }
} satisfies ExportedHandler<Env, EventsMessage>

/**
 * On the Worker's own public hostname only the public API and the MCP server answer (M19.2, M19.3): `/v1` and
 * `/mcp`. Everything else (auth, the RPC, the dev routes) is reached through the console's service binding, on the
 * console's origin.
 */
const servedHere = (request: Request): boolean => {
  const url = new URL(request.url)
  if (env.PUBLIC_API_HOST === undefined || url.host !== env.PUBLIC_API_HOST) return true
  return url.pathname === "/mcp" || url.pathname === "/v1" || url.pathname.startsWith("/v1/")
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

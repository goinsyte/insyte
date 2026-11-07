import { tracing } from "cloudflare:workers"
import { HttpRouter } from "effect/http"
import { AppLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import { Telemetry } from "./platform/Observability.ts"

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(AppLayer)

export default {
  async fetch(request, _env, ctx) {
    const response = await web.handler(continueTrace(request))
    ctx.waitUntil(Telemetry.flush()) // spans leave after the response is out (17 §1)
    return response
  }
} satisfies ExportedHandler<Env>

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

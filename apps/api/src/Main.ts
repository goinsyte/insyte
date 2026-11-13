import { env, tracing } from "cloudflare:workers"
import { HttpRouter } from "effect/http"
import { AppLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import type { IngestMessage } from "./platform/Ingest.ts"
import { Telemetry } from "./platform/Observability.ts"
import type { EventsMessage } from "./platform/Relay.ts"
import { email } from "./transports/email/Email.ts"
import { scheduled } from "./transports/jobs/Cron.ts"
import { queue } from "./transports/jobs/Queue.ts"

// The Durable Object classes this Worker hosts; infra and `wrangler.jsonc` bind them by these names.
export { RateLimiter } from "./platform/RateLimiter.ts"
export { RoomDurableObject } from "./platform/Room.ts"
// The live room per workspace (M14 step 3): storefront visitors in memory.
export { LiveRoomDurableObject } from "./platform/LiveRoom.ts"
// The gate per external account (M6.3), and the store backfill's Workflow.
export { ConnectionGateObject } from "./platform/ConnectionGate.ts"
export { ShopifyBackfillWorkflow } from "./workflows/ShopifyBackfill.ts"
// A store's first analysis (M6.5).
export { EvidencePackWorkflow } from "./workflows/EvidencePack.ts"
export { FirstAnalysisWorkflow } from "./workflows/FirstAnalysis.ts"
export { ForwardSendWorkflow } from "./workflows/ForwardSend.ts"
export { MarketingSyncWorkflow } from "./workflows/MarketingSync.ts"
export { MonthlyCloseWorkflow } from "./workflows/MonthlyClose.ts"
export { ReturnLabelWorkflow } from "./workflows/ReturnLabel.ts"
// A flow's run (M12 step 3).
export { AutomationRunWorkflow } from "./workflows/AutomationRun.ts"
export { ShopifyWriteWorkflow } from "./workflows/ShopifyWrite.ts"
export { WebhookDeliveryWorkflow } from "./workflows/WebhookDelivery.ts"

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(AppLayer)

export default {
  async fetch(request, _env, ctx) {
    if (!servedHere(request)) return Response.json({ error: { code: "not_found" } }, { status: 404 })
    const response = await web.handler(continueTrace(request))
    ctx.waitUntil(Telemetry.flush()) // spans leave after the response is out (17 §1)
    return response
  },
  queue,
  email,
  scheduled
} satisfies ExportedHandler<Env, EventsMessage | IngestMessage>

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

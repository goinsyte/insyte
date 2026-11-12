import { receive } from "@insyte/modules/inbox/use-cases/inbound"
import { isReplyAddress, receiveReply } from "@insyte/modules/notifications/use-cases/replies"
import { env, tracing } from "cloudflare:workers"
import { ManagedRuntime } from "effect"
import { HttpRouter } from "effect/http"
import { AppLayer, BackgroundLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import { parseMail } from "./platform/InboundMail.ts"
import { ingest, type IngestMessage, reconcile, syncRuntime, trackingSweep } from "./platform/Ingest.ts"
import { Telemetry } from "./platform/Observability.ts"
import {
  deliver,
  digestSweep,
  type EventsMessage,
  factsSweep,
  notifySweep,
  queueSweep,
  sweep
} from "./platform/Relay.ts"
import { withRequestDb } from "./platform/RequestDb.ts"
import { retentionSweep } from "./platform/Retention.ts"

// The Durable Object classes this Worker hosts; infra and `wrangler.jsonc` bind them by these names.
export { RateLimiter } from "./platform/RateLimiter.ts"
export { RoomDurableObject } from "./platform/Room.ts"
// The gate per external account (M6.3), and the store backfill's Workflow.
export { ConnectionGateObject } from "./platform/ConnectionGate.ts"
export { ShopifyBackfillWorkflow } from "./workflows/ShopifyBackfill.ts"
// A store's first analysis (M6.5).
export { FirstAnalysisWorkflow } from "./workflows/FirstAnalysis.ts"
export { ForwardSendWorkflow } from "./workflows/ForwardSend.ts"
export { MarketingSyncWorkflow } from "./workflows/MarketingSync.ts"
export { ReturnLabelWorkflow } from "./workflows/ReturnLabel.ts"
export { ShopifyWriteWorkflow } from "./workflows/ShopifyWrite.ts"

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

  /**
   * The outbox relay's consumer (M1.4): a throw leaves the batch to the queue's retries, then its dead letters. And
   * Shopify's webhooks (M6.3), each delivery acked or retried on its own.
   */
  async queue(batch, _env, ctx) {
    if (batch.queue.startsWith("insyte-ingest")) return ingest(batch as MessageBatch<IngestMessage>)
    const events = batch as MessageBatch<EventsMessage>
    try {
      await background.runPromise(withRequestDb(deliver(events.messages.flatMap((m) => m.body.outboxIds))))
      batch.ackAll()
    } finally {
      ctx.waitUntil(Telemetry.flush())
    }
  },

  /**
   * A support mail at a forwarding address (M11 step 1), through Cloudflare Email Routing: into its mailbox's inbox; an
   * answer to a notification mail (`reply+<token>@`), a comment on its record (M11 step 13.5).
   * An address no mailbox has is refused, so the sender hears it bounced; a throw leaves it to Email Routing's retry.
   */
  async email(message, _env, ctx) {
    try {
      const mail = await parseMail(await new Response(message.raw).arrayBuffer())
      // An answer to a notification mail becomes a comment (M11 step 13.5); anything else there is dropped unanswered.
      if (isReplyAddress(message.to)) {
        await background.runPromise(withRequestDb(receiveReply(message.to, mail.from.email, mail.text)))
        return
      }
      const stored = await background.runPromise(withRequestDb(receive(message.to, mail)))
      if (stored === undefined) message.setReject("Onbekend adres")
    } finally {
      ctx.waitUntil(Telemetry.flush())
    }
  },

  /** Every minute (on staging every fifteenth, `infra/app.ts`): the relay's sweep for events a kick missed and the
   * notes quiet hours or a failed try held back (M11.5); every fifteenth, the stores' reconcile (M6.3), the tracking sweep (M8.4), Start's queue (M10.1), the
   * daily facts (M10.4, at 02:00 UTC their nightly pass) and the members' daily digests (M11.5). */
  scheduled(controller, _env, ctx) {
    ctx.waitUntil(background.runPromise(withRequestDb(sweep())).finally(() => Telemetry.flush()))
    ctx.waitUntil(background.runPromise(withRequestDb(notifySweep())).finally(() => Telemetry.flush()))
    const at = new Date(controller.scheduledTime)
    if (at.getUTCMinutes() % 15 === 0) {
      const nightly = at.getUTCHours() === 2 && at.getUTCMinutes() === 0
      ctx.waitUntil(background.runPromise(withRequestDb(factsSweep(nightly))).finally(() => Telemetry.flush()))
      ctx.waitUntil(syncRuntime.runPromise(reconcile).finally(() => Telemetry.flush()))
      ctx.waitUntil(syncRuntime.runPromise(trackingSweep).finally(() => Telemetry.flush()))
      // Start's queue (M10.1): what no event says, a stock-out or a review coming due.
      ctx.waitUntil(background.runPromise(withRequestDb(queueSweep())).finally(() => Telemetry.flush()))
      ctx.waitUntil(background.runPromise(withRequestDb(digestSweep(at))).finally(() => Telemetry.flush()))
      // The nightly erase of what is past its retention, at 03:00 in each workspace's timezone (M17 step 20.1b).
      ctx.waitUntil(background.runPromise(withRequestDb(retentionSweep(at))).finally(() => Telemetry.flush()))
    }
  }
} satisfies ExportedHandler<Env, EventsMessage | IngestMessage>

/**
 * On the Worker's own public hostname only the public API, the MCP server and the webhooks answer (M19.2, M19.3,
 * M6.3, M8.3, M8.4): `/v1`, `/mcp`, `/hooks/shopify`, `/hooks/aftership` and `/hooks/supplier/:id`. Everything else (auth, the RPC, the dev routes) is reached through the console's service binding, on the
 * console's origin.
 */
const servedHere = (request: Request): boolean => {
  const url = new URL(request.url)
  if (env.PUBLIC_API_HOST === undefined || url.host !== env.PUBLIC_API_HOST) return true
  return url.pathname === "/mcp" || url.pathname === "/v1" || url.pathname.startsWith("/v1/") ||
    url.pathname === "/hooks/shopify" || url.pathname === "/hooks/aftership" ||
    url.pathname.startsWith("/hooks/supplier/")
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

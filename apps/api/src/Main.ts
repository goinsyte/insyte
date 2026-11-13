import { env } from "cloudflare:workers"
import { HttpRouter } from "effect/http"
import { AppLayer } from "./platform/AppLayer.ts"
import type { Env } from "./platform/Env.ts"
import { Telemetry } from "./platform/Observability.ts"
import { continueTrace } from "./platform/Tracing.ts"
import { isPublicPath } from "./transports/public/Paths.ts"

/*
 * The API Worker, `insyte-api` (ADR-0041): the HTTP app and inbound mail. The queue consumers, the cron, the Workflows
 * and every Durable Object run in the jobs Worker (`Jobs.ts`), reached through cross-script bindings;
 * the public API and the MCP server in the public Worker (`Public.ts`), which this one hands `/v1` and `/mcp`.
 */

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(AppLayer)

export default {
  async fetch(request, _env, ctx) {
    if (!servedHere(request)) return Response.json({ error: { code: "not_found" } }, { status: 404 })
    // The public API and the MCP server: the public Worker's, on this Worker's hostname (ADR-0041 step 5).
    if (isPublicPath(new URL(request.url).pathname)) return env.PUBLIC.fetch(request)
    // This request's own exporter (`Observability.ts`); its spans leave after the response is out (17 §1).
    const spans = Telemetry.open()
    try {
      return await web.handler(continueTrace(request), spans.context)
    } finally {
      ctx.waitUntil(spans.flush())
    }
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

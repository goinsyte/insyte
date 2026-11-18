import { env } from "cloudflare:workers"
import type { Env } from "./platform/Env.ts"
import { onFirstRequest } from "./platform/OnFirstRequest.ts"
import { isPublicPath } from "./transports/public/Paths.ts"

/*
 * The API Worker, `insyte-api` (ADR-0041): the HTTP app and inbound mail. The queue consumers, the cron, the Workflows
 * and every Durable Object run in the jobs Worker (`Jobs.ts`), reached through cross-script bindings;
 * the public API and the MCP server in the public Worker (`Public.ts`), which this one hands `/v1` and `/mcp`.
 *
 * The app itself (`MainApp.ts`) loads with the first request this Worker serves, not at startup (ADR-0041 §3).
 */

const app = onFirstRequest(() => import("./MainApp.ts"))

export default {
  async fetch(request, bindings, ctx) {
    if (!servedHere(request)) return Response.json({ error: { code: "not_found" } }, { status: 404 })
    // The public API and the MCP server: the public Worker's, on this Worker's hostname (ADR-0041 step 5).
    if (isPublicPath(new URL(request.url).pathname)) return env.PUBLIC.fetch(request)
    return (await app()).fetch(request, bindings, ctx)
  },
  // A support mail (M11 step 1): its handler and the background layer load on the first one, not at startup.
  email: (message, bindings, ctx) =>
    import("./transports/email/Email.ts").then(({ email }) => email(message, bindings, ctx))
} satisfies ExportedHandler<Env>

/**
 * On the Worker's own public hostname only the public API, the MCP server and the webhooks answer (M19.2, M19.3,
 * M6.3, M8.3, M8.4, M13): `/v1`, `/mcp`, `/hooks/shopify`, `/hooks/aftership`, `/hooks/stripe` and
 * `/hooks/supplier/:id`; and the
 * storefront's Web Pixel, `/api/public/pixel/:storeId` (M14 step 3), an affiliate's short link `/r/:slug` (M16 step 4),
 * and its website chat, `/api/public/chat/*` (M15 step 8). Everything else (auth, the RPC, the dev routes) is reached through the console's service binding, on the
 * console's origin.
 */
const servedHere = (request: Request): boolean => {
  const url = new URL(request.url)
  if (env.PUBLIC_API_HOST === undefined || url.host !== env.PUBLIC_API_HOST) return true
  return url.pathname === "/mcp" || url.pathname === "/v1" || url.pathname.startsWith("/v1/") ||
    url.pathname === "/hooks/shopify" || url.pathname === "/hooks/aftership" || url.pathname === "/hooks/stripe" ||
    url.pathname.startsWith("/hooks/supplier/") || url.pathname.startsWith("/api/public/pixel/") ||
    url.pathname.startsWith("/api/public/chat/") || url.pathname.startsWith("/r/")
}

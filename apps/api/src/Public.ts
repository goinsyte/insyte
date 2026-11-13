import { HttpRouter } from "effect/http"
import type { Env } from "./platform/Env.ts"
import { Telemetry } from "./platform/Observability.ts"
import { PublicLayer } from "./platform/PublicLayer.ts"
import { continueTrace } from "./platform/Tracing.ts"

/*
 * The public Worker, `insyte-public` (ADR-0041 step 5): the public API and the MCP server. It has no hostname of its
 * own: the API Worker hands it `/v1` and `/mcp` over a service binding (`Main.ts`), so a client keeps the API's
 * hostname, and the API Worker never loads the V1 schemas or the tools. It hosts nothing: its Workflows and Durable
 * Objects, the rate limiter's counters among them, are the jobs Worker's.
 */

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(PublicLayer)

export default {
  async fetch(request, _env, ctx) {
    const response = await web.handler(continueTrace(request))
    ctx.waitUntil(Telemetry.flush()) // spans leave after the response is out (17 §1)
    return response
  }
} satisfies ExportedHandler<Env>

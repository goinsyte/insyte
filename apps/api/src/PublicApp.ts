import { HttpRouter } from "effect/http"
import type { Env } from "./platform/Env.ts"
import { flushAtRequestEnd, Telemetry } from "./platform/Observability.ts"
import { PublicLayer } from "./platform/PublicLayer.ts"
import { continueTrace } from "./platform/Tracing.ts"

/*
 * The public Worker's app (`Public.ts`): the public API and the MCP server. The entry loads this module on the first
 * request an isolate serves (`platform/OnFirstRequest.ts`), so its module scope runs then, not at startup.
 */

/** Module scope: the layer is built once per isolate, and building it does no request-time I/O. */
const web = HttpRouter.toWebHandler(PublicLayer, { middleware: flushAtRequestEnd })

export const fetch: ExportedHandlerFetchHandler<Env> = async (request, _env, ctx) => {
  // This request's own exporter (`Observability.ts`); its spans leave once the response, streamed or not, is out
  // (17 §1).
  const spans = Telemetry.open()
  let response: Response
  try {
    response = await web.handler(continueTrace(request), spans.context)
  } catch (error) {
    ctx.waitUntil(spans.flush())
    throw error
  }
  ctx.waitUntil(spans.flushAfterRequest())
  return response
}

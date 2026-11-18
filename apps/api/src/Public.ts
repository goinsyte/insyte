import type { Env } from "./platform/Env.ts"
import { onFirstRequest } from "./platform/OnFirstRequest.ts"

/*
 * The public Worker, `insyte-public` (ADR-0041 step 5): the public API and the MCP server. It has no hostname of its
 * own: the API Worker hands it `/v1` and `/mcp` over a service binding (`Main.ts`), so a client keeps the API's
 * hostname, and the API Worker never loads the V1 schemas or the tools. It hosts nothing: its Workflows and Durable
 * Objects, the rate limiter's counters among them, are the jobs Worker's.
 *
 * The app itself (`PublicApp.ts`) loads with the first request, not at startup (ADR-0041 §3).
 */

const app = onFirstRequest(() => import("./PublicApp.ts"))

export default {
  fetch: (request, env, ctx) => app().then((loaded) => loaded.fetch(request, env, ctx))
} satisfies ExportedHandler<Env>

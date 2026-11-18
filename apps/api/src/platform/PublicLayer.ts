import { Layer } from "effect"
import { NotFound } from "../transports/http/NotFound.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { McpLive } from "../transports/public/McpLive.ts"
import { PublicApiLive } from "../transports/public/PublicApiLive.ts"
import { RedirectRoutes } from "../transports/public/redirect/RedirectRoutes.ts"
import { onKeys } from "./Services.ts"

/*
 * The public Worker's layer (ADR-0041 step 5): the public API (`/v1`, M19.2) and the MCP server (`/mcp`, M19.3) over
 * the same services as the API's routes, so a key and a person keep seeing the same team; and an affiliate's short
 * link (`/r/:slug`, M16 step 4). Nothing else answers here.
 */
export const PublicLayer = onKeys(Layer.mergeAll(PublicApiLive, McpLive, RedirectRoutes, RequestContext, NotFound))

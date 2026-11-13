import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api"
import { IpNotAllowedV1, RateLimitedV1, UnauthorizedV1 } from "./Errors.ts"

/* What a key is (M19.2): the bearer key every endpoint is behind, and what it provides to the handlers. */

/** The authenticated key, beside its principal: what `/v1/me` answers, and the request's id for its errors. */
export class CurrentApiKey extends Context.Service<CurrentApiKey, {
  readonly id: string
  readonly label: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly requestId: string
}>()("api/CurrentApiKey") {}

/**
 * `Authorization: Bearer ins_live_…` → the key's principal and its request connection. Every endpoint is behind it;
 * every response carries `Insyte-Request-Id`, and each answered call lands in the key's request log.
 */
export class ApiKeyAuth extends HttpApiMiddleware.Service<ApiKeyAuth, {
  provides: CurrentPrincipal | CurrentApiKey | Db
}>()("api/ApiKeyAuth", {
  error: [UnauthorizedV1, IpNotAllowedV1, RateLimitedV1],
  security: { bearer: HttpApiSecurity.bearer }
}) {}

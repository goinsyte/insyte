import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi
} from "effect/http-api"

/*
 * The public API (M19.2, api.md §6): REST under `/v1`, a bearer API key, JSON in snake_case English. What a key may do
 * is its access as the catalogue allows it through the API; this first cut reads: the key itself, the team and the
 * roles. Its OpenAPI document is generated from this file, and the reference at `/v1/docs` is drawn from that.
 */

/* ── errors ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One envelope for every error (api.md §6): `{ error: { code, message, request_id, … } }`, `code` a frozen `…V1` tag,
 * `request_id` the `Insyte-Request-Id` the response carries.
 */
const envelope = <const Code extends string, const Fields extends Schema.Struct.Fields>(
  code: Code,
  status: number,
  fields: Fields
) =>
  Schema.Struct({
    error: Schema.Struct({ code: Schema.Literal(code), message: Schema.String, request_id: Schema.String, ...fields })
  }).pipe(HttpApiSchema.status(status)).annotate({ identifier: code })

/** No key, or one that is malformed, unknown, revoked or expired; `reason` says which. */
export const UnauthorizedV1 = envelope("UnauthorizedV1", 401, { reason: Schema.String })
/** The key is fenced to addresses this call did not come from. */
export const IpNotAllowedV1 = envelope("IpNotAllowedV1", 403, {})
/** The key's access lacks a scope the endpoint needs, as `area.read` or `area.write`. */
export const ScopeMissingV1 = envelope("ScopeMissingV1", 403, { scope: Schema.String })
/** Over the key's rate (120 a minute, 10 a second); `retry_after` in seconds. */
export const RateLimitedV1 = envelope("RateLimitedV1", 429, { retry_after: Schema.Int })

export type ScopeMissingV1 = typeof ScopeMissingV1.Type

/* ── what a key is ──────────────────────────────────────────────────────────────────────────────── */

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

/* ── resources ──────────────────────────────────────────────────────────────────────────────────── */

const Access = Schema.Literals(["none", "read", "write", "manage"])

export const Me = Schema.Struct({
  key: Schema.Struct({ id: Schema.String, label: Schema.String, scopes: Schema.Array(Schema.String) }),
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String })
}).annotate({ identifier: "Me" })

export const Member = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.Struct({ id: Schema.String, label: Schema.String }),
  status: Schema.Literals(["active", "deactivated"]),
  joined_at: Schema.String,
  last_active_at: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Member" })

export const Role = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  system: Schema.Boolean,
  /** Area → what the role may do there. */
  access: Schema.Record(Schema.String, Access)
}).annotate({ identifier: "Role" })

const List = <S extends Schema.Top>(item: S) => Schema.Struct({ data: Schema.Array(item) })

/* ── the API ────────────────────────────────────────────────────────────────────────────────────── */

export class KeyGroup extends HttpApiGroup.make("key")
  .add(
    HttpApiEndpoint.get("me", "/me", { success: Me }).annotate(
      OpenApi.Description,
      "The key making the call: its scopes and the workspace it belongs to."
    )
  )
  .annotate(OpenApi.Title, "Key")
{}

export class TeamGroup extends HttpApiGroup.make("team")
  .add(
    HttpApiEndpoint.get("members", "/members", { success: List(Member), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's members. Needs `team.read`."
    ),
    HttpApiEndpoint.get("roles", "/roles", { success: List(Role), error: ScopeMissingV1 }).annotate(
      OpenApi.Description,
      "The workspace's roles and what each may do per area. Needs `team.read`."
    )
  )
  .annotate(OpenApi.Title, "Team")
{}

export class PublicApi extends HttpApi.make("insyte")
  .add(KeyGroup, TeamGroup)
  .middleware(ApiKeyAuth)
  .prefix("/v1")
  .annotate(OpenApi.Title, "Insyte API")
  .annotate(OpenApi.Version, "1")
{}

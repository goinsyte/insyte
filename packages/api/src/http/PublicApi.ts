import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity, OpenApi } from "effect/http-api"

/*
 * The public API (M19.2, 07 §3.5): REST under `/v1`, a bearer API key, JSON in English field names. What a key may do
 * is its access as the catalogue allows it through the API; this first cut reads: the key itself, the team and the
 * roles. Its OpenAPI document is generated from this file, and the reference at `/v1/docs` is drawn from that.
 */

/* ── errors ─────────────────────────────────────────────────────────────────────────────────────── */

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  /** `missing`, `malformed`, `unknown`, `revoked`, `expired` or `ip`. */
  reason: Schema.String
}, { httpApiStatus: 401 }) {}

/** The key's access lacks a scope the endpoint needs, as `area.read` or `area.write`. */
export class InsufficientScope extends Schema.TaggedError<InsufficientScope>()("InsufficientScope", {
  scope: Schema.String
}, { httpApiStatus: 403 }) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfter: Schema.Int
}, { httpApiStatus: 429 }) {}

/* ── what a key is ──────────────────────────────────────────────────────────────────────────────── */

/** The authenticated key, beside its principal: what `/v1/me` answers without another query. */
export class CurrentApiKey extends Context.Service<CurrentApiKey, {
  readonly id: string
  readonly label: string
  readonly workspaceId: string
  readonly workspaceName: string
}>()("api/CurrentApiKey") {}

/**
 * `Authorization: Bearer ins_live_…` → the key's principal and its request connection. Every endpoint is behind it;
 * a key over its rate gets 429 with `retryAfter`, and each answered call lands in the key's request log.
 */
export class ApiKeyAuth extends HttpApiMiddleware.Service<ApiKeyAuth, {
  provides: CurrentPrincipal | CurrentApiKey | Db
}>()("api/ApiKeyAuth", {
  error: [Unauthorized, RateLimited],
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
  joinedAt: Schema.String,
  lastActiveAt: Schema.NullOr(Schema.String)
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
    HttpApiEndpoint.get("members", "/members", { success: List(Member), error: InsufficientScope }).annotate(
      OpenApi.Description,
      "The workspace's members. Needs `team.read`."
    ),
    HttpApiEndpoint.get("roles", "/roles", { success: List(Role), error: InsufficientScope }).annotate(
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

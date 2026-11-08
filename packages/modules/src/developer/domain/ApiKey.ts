import { Schema } from "effect"
import { StoreAccess } from "../../shared/domain/Stores.ts"

/*
 * API keys (M19.1) as Instellingen → API-sleutels reads them (`lib/developer.ts`): a key holds a role, and changes when
 * the role does, or its own scopes per area (read, or read and write), narrowed by stores, an expiry and an IP allow
 * list. The secret is shown once, when the key is made or rotated. Times are epoch milliseconds.
 */

export const ApiAccessLevel = Schema.Literals([0, 1, 2])

export const KeyAccess = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("role"), roleId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("custom"),
    /** Per area the key names; an area left out is none. */
    scopes: Schema.Record(Schema.String, ApiAccessLevel)
  })
])
export type KeyAccess = typeof KeyAccess.Type

export class ApiKeyView extends Schema.Class<ApiKeyView>("developer/ApiKeyView")({
  id: Schema.String,
  label: Schema.String,
  prefix: Schema.String,
  createdAt: Schema.Finite,
  createdBy: Schema.String,
  lastUsedAt: Schema.NullOr(Schema.Finite),
  status: Schema.Literals(["active", "revoked"]),
  access: KeyAccess,
  stores: StoreAccess,
  expiresAt: Schema.NullOr(Schema.Finite),
  ips: Schema.Array(Schema.String),
  rotated: Schema.NullOr(Schema.Struct({ previousPrefix: Schema.String, until: Schema.Finite })),
  revokedAt: Schema.NullOr(Schema.Finite),
  agent: Schema.Boolean
}) {}

export class ApiRequestView extends Schema.Class<ApiRequestView>("developer/ApiRequestView")({
  id: Schema.String,
  method: Schema.String,
  path: Schema.String,
  status: Schema.Int,
  ms: Schema.Int,
  at: Schema.Finite,
  ip: Schema.NullOr(Schema.String)
}) {}

/** What the key detail draws: the last requests, and the requests and errors per day for 14 days. */
export class KeyActivity extends Schema.Class<KeyActivity>("developer/KeyActivity")({
  requests: Schema.Array(ApiRequestView),
  usage: Schema.Array(Schema.Struct({ day: Schema.Finite, count: Schema.Int, errors: Schema.Int }))
}) {}

export const CreateKey = Schema.Struct({
  label: Schema.String,
  access: KeyAccess,
  stores: StoreAccess,
  /** Days until it lapses; `null` never. */
  expiresInDays: Schema.NullOr(Schema.Int),
  ips: Schema.Array(Schema.String),
  agent: Schema.Boolean
})
export type CreateKey = typeof CreateKey.Type

export const UpdateKey = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.String),
  ips: Schema.optional(Schema.Array(Schema.String))
})
export type UpdateKey = typeof UpdateKey.Type

export const RotateKey = Schema.Struct({ id: Schema.String, graceMs: Schema.Int })
export const KeyRef = Schema.Struct({ id: Schema.String })

/** A key and its secret, shown once: after making it or rotating it. */
export class WithSecret extends Schema.Class<WithSecret>("developer/WithSecret")({
  key: ApiKeyView,
  secret: Schema.String
}) {}

/**
 * A bearer token the public API turns away (M19.2), with why: a machine reason for the log and the 401's `reason`,
 * never which part of a token was wrong beyond that.
 */
export class KeyRefused extends Schema.TaggedError<KeyRefused>()("KeyRefused", {
  reason: Schema.Literals(["missing", "malformed", "unknown", "revoked", "expired", "ip"])
}) {}

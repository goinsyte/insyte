import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"

/*
 * The public API's errors (M19.2, api.md §6): one envelope, one frozen `…V1` code per refusal. Each endpoint names
 * the ones it can answer; the key door's own are on `ApiKeyAuth` (`Security.ts`).
 */

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

/** A query parameter that cannot be read: an unknown cursor, a page size out of range. */
export const InvalidRequestV1 = envelope("InvalidRequestV1", 400, { field: Schema.String })

/** No such record in the key's stores. */
export const NotFoundV1 = envelope("NotFoundV1", 404, {})
/** The record is not in a state that allows this (an order already cancelled, a refund already made); `reason` says. */
export const ConflictV1 = envelope("ConflictV1", 409, { reason: Schema.String })
/** The body is not what the endpoint takes; `fields` names each field and why. */
export const ValidationFailedV1 = envelope("ValidationFailedV1", 400, {
  fields: Schema.Record(Schema.String, Schema.String)
})
/** More than the key may refund on one order; `limit_minor` is its limit. */
export const RefundOverLimitV1 = envelope("RefundOverLimitV1", 422, { limit_minor: Schema.Int })
/**
 * An agent's call the workspace's autonomy rules do not allow (M15 step 6, ADR-0027): the action is set to Nooit, or
 * is outside the catalogue; `reason` says which (`policy`, `unknown`). Nothing happened.
 */
export const ActionNotAllowedV1 = envelope("ActionNotAllowedV1", 403, { action: Schema.String, reason: Schema.String })
/** The `Idempotency-Key` was first used for a different request. */
export const IdempotencyKeyReusedV1 = envelope("IdempotencyKeyReusedV1", 422, {})

export type ScopeMissingV1 = typeof ScopeMissingV1.Type
export type NotFoundV1 = typeof NotFoundV1.Type
export type ConflictV1 = typeof ConflictV1.Type
export type ValidationFailedV1 = typeof ValidationFailedV1.Type
export type RefundOverLimitV1 = typeof RefundOverLimitV1.Type
export type IdempotencyKeyReusedV1 = typeof IdempotencyKeyReusedV1.Type
export type ActionNotAllowedV1 = typeof ActionNotAllowedV1.Type
export type InvalidRequestV1 = typeof InvalidRequestV1.Type

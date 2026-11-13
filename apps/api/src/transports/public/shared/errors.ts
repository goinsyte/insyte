import type {
  ConflictV1,
  IdempotencyKeyReusedV1,
  InvalidRequestV1,
  NotFoundV1,
  RefundOverLimitV1,
  ScopeMissingV1,
  ValidationFailedV1
} from "@insyte/api/http/Errors"
import { CurrentApiKey } from "@insyte/api/http/Security"
import type { Forbidden } from "@insyte/domain/Errors"
import { isSpecial, type Permission } from "@insyte/domain/Permissions"
import { Effect } from "effect"

/*
 * A use case's refusal in its V1 envelope (M19.2, api.md §6), with the request's id: what every slice's `/v1` and MCP
 * answers share. A slice's own refusals (a return's move, a ticket's member) map onto these in its `<Slice>V1.ts`.
 */

/** The use case's refusal as the scope the key misses, in the V1 envelope (a special action is its own scope). */
export const scopeMissing = (e: Forbidden) =>
  Effect.flatMap(CurrentApiKey, (key) => {
    const scope = isSpecial(e.permission as Permission)
      ? e.permission
      : `${e.permission}.${e.level >= 2 ? "write" : "read"}`
    return Effect.fail<ScopeMissingV1>({
      error: { code: "ScopeMissingV1", message: `This key lacks ${scope}.`, request_id: key.requestId, scope }
    })
  })

/** A write's `Idempotency-Key`: the public API needs one on every write (MCP's tools go without). */
export const keyOf = (header: string | undefined) =>
  header !== undefined && header.trim() !== "" && header.length <= 255
    ? Effect.succeed(header)
    : Effect.flatMap(CurrentApiKey, (key) =>
      Effect.fail<InvalidRequestV1>({
        error: {
          code: "InvalidRequestV1",
          message: "Every write needs an Idempotency-Key header of up to 255 characters, the same when you retry.",
          request_id: key.requestId,
          field: "idempotency-key"
        }
      }))

/** An error in its V1 envelope, with the request's id. */
const fail = <Code extends string, Extra extends Record<string, unknown>>(code: Code, message: string, extra: Extra) =>
  Effect.flatMap(CurrentApiKey, (key) => Effect.fail({ error: { code, message, request_id: key.requestId, ...extra } }))

const ENTITY: Record<string, string> = {
  return: "return",
  ticket: "ticket",
  customer: "customer",
  member: "member",
  automation: "automation",
  run: "run",
  sheet: "sheet"
}
export const notFound = (e?: { readonly entity?: string }) =>
  fail("NotFoundV1" as const, `No such ${ENTITY[e?.entity ?? ""] ?? "order"} in this key's stores.`, {})
export const conflict = (reason: string) => fail("ConflictV1" as const, `Not possible now: ${reason}.`, { reason })
export const validation = (fields: Readonly<Record<string, string>>) =>
  fail("ValidationFailedV1" as const, "The request has fields that cannot be used.", { fields: { ...fields } })

/** What an order command can refuse, as the use cases say it. */
export type WriteRefusal =
  | Forbidden
  | { readonly _tag: "NotFound"; readonly entity?: string }
  | { readonly _tag: "Conflict"; readonly reason: string }
  | { readonly _tag: "Invalid"; readonly fields: Readonly<Record<string, string>> }
  | { readonly _tag: "IdempotencyKeyReused" }
  | { readonly _tag: "IdempotencyInFlight" }

type WriteV1 = ScopeMissingV1 | NotFoundV1 | ConflictV1 | ValidationFailedV1 | IdempotencyKeyReusedV1

/** An order command's refusal in its V1 envelope. */
export const writeV1 = (e: WriteRefusal): Effect.Effect<never, WriteV1, CurrentApiKey> => {
  switch (e._tag) {
    case "Forbidden":
      return scopeMissing(e)
    case "NotFound":
      return notFound(e)
    case "Conflict":
      return conflict(e.reason)
    case "Invalid":
      return validation(e.fields)
    case "IdempotencyKeyReused":
      return fail("IdempotencyKeyReusedV1" as const, "This Idempotency-Key was used for a different request.", {})
    case "IdempotencyInFlight":
      return conflict("in_progress")
  }
}

/** The same for a refund, which may also be over the key's limit or more than is left. */
export const refundV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "RefundOverLimit"; readonly limitMinor: number }
    | { readonly _tag: "RefundOverBalance" }
    | { readonly _tag: "AlreadyRefunded" }
): Effect.Effect<never, WriteV1 | RefundOverLimitV1, CurrentApiKey> => {
  switch (e._tag) {
    case "RefundOverLimit":
      return fail("RefundOverLimitV1" as const, "More than this key may refund on one order.", {
        limit_minor: e.limitMinor
      })
    case "RefundOverBalance":
      return conflict("over_balance")
    case "AlreadyRefunded":
      return conflict("already_refunded")
    default:
      return writeV1(e)
  }
}

/** A query parameter the use case refused, in the V1 envelope. */
export const badQuery = (field: string, message: string) =>
  Effect.flatMap(CurrentApiKey, (key) =>
    Effect.fail<InvalidRequestV1>({
      error: { code: "InvalidRequestV1", message, request_id: key.requestId, field }
    }))

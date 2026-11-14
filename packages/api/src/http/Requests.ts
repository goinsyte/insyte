import { Schema } from "effect"
import {
  ActionNotAllowedV1,
  ConflictV1,
  IdempotencyKeyReusedV1,
  InvalidRequestV1,
  NotFoundV1,
  ScopeMissingV1,
  ValidationFailedV1
} from "./Errors.ts"

/* What the endpoints read besides their body (M19.2, M7): a record by its id, and a write's `Idempotency-Key`. */

/** What every write reads from its headers: the caller's key for doing it once. */
/**
 * Every write names an `Idempotency-Key`; a missing one is refused with `InvalidRequestV1` by the handler, so the
 * refusal comes in the V1 envelope rather than as a bare schema error.
 */
export const Writes = {
  "idempotency-key": Schema.optional(Schema.String).annotate({
    description: "Required. A value of your own, up to 255 characters; send the same one when you retry."
  })
}
export const ById = { id: Schema.String }
/** What a write can refuse; `ActionNotAllowedV1` (`use_mcp`) is an agent's key, which writes over MCP only. */
export const WriteErrors = [
  ActionNotAllowedV1,
  ScopeMissingV1,
  NotFoundV1,
  ConflictV1,
  ValidationFailedV1,
  IdempotencyKeyReusedV1,
  InvalidRequestV1
]

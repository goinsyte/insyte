import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Schema } from "effect"
import { ConflictV1, IdempotencyKeyReusedV1, NotFoundV1, ScopeMissingV1, ValidationFailedV1 } from "../http/Errors.ts"
import { CurrentApiKey } from "../http/Security.ts"

/* What every slice's tools share (M19.3): the key they run as, an order's id, a write's idempotency key and refusals. */

/** What the key door provides: every tool runs as the key. */
export const asKey = () => [CurrentPrincipal, CurrentApiKey, Db]

export const OrderId = Schema.String.annotate({ description: "The order's id (ord_…), as list_orders gives it." })
export const IdempotencyKey = Schema.optional(Schema.String).annotate({
  description: "Your own key for doing this once: the same key again answers the first result instead of acting twice."
})
export const WriteFailure = Schema.Union([
  ScopeMissingV1,
  NotFoundV1,
  ConflictV1,
  ValidationFailedV1,
  IdempotencyKeyReusedV1
])

/**
 * What an agent's call answers where the workspace asks first (M15 step 6, ADR-0027): nothing happened yet; a person
 * files the proposal, with their own permissions, or sets it aside. An agent key's writes go through the workspace's
 * autonomy rules; any other key acts as before.
 */
export const AgentProposalV1 = Schema.Struct({
  object: Schema.Literal("agent_proposal"),
  proposal_id: Schema.String,
  agent_action_id: Schema.String,
  reason: Schema.NullOr(Schema.String).annotate({
    description: "Why it asks: `policy` (set to Eerst vragen), `locked`, `limit`, `budget` or `disabled`."
  }),
  message: Schema.String
}).annotate({ identifier: "AgentProposal" })

/** A write an agent's key makes under the autonomy rules: the result, or the proposal it became. */
export const Governed = <S extends Schema.Top>(success: S) => Schema.Union([success, AgentProposalV1])

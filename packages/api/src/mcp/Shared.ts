import { Db } from "@insyte/database/Db"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import type { AreaId, SpecialId } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Schema } from "effect"
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

/*
 * What a tool needs of the key (M19.3): `tools/list` names a tool only to a key that can call it, and a call of one it
 * does not name is refused as before, by the use case (`ScopeMissingV1`) or the agents' rule (`ActionNotAllowedV1`).
 * Each tool says it here, next to the words of its description; the server reads it per request (`mcp/Reach.ts`).
 */

/** One thing a tool needs: an area at a level (1 read, 2 write), or a special action. */
export type Need = { readonly area: AreaId; readonly level: 1 | 2 } | { readonly special: SpecialId }

/** Everything the tool needs, all of it. None: any key may call it (or what it needs depends on its record). */
export const Needs = Context.Reference<ReadonlyArray<Need>>("insyte/mcp/Needs", { defaultValue: () => [] })

export const read = (area: AreaId): Need => ({ area, level: 1 })
export const write = (area: AreaId): Need => ({ area, level: 2 })
export const special = (id: SpecialId): Need => ({ special: id })

/**
 * How a write tool meets an agent's key (ADR-0027): through the workspace's autonomy rules as one of `actions` (`null`
 * where the action depends on the record, as a plate's does), or refused (`notForAgents`). A write tool that says
 * nothing is not listed to an agent's key; a read is listed as its scopes allow.
 */
export type AgentReach = { readonly kind: "governed"; readonly actions: ReadonlyArray<AgentActionId> | null } | {
  readonly kind: "refused"
}

export const ForAgents = Context.Reference<AgentReach>("insyte/mcp/ForAgents", {
  defaultValue: () => ({ kind: "refused" })
})

export const governedAs = (...actions: ReadonlyArray<AgentActionId>): AgentReach => ({ kind: "governed", actions })
export const governedByRecord: AgentReach = { kind: "governed", actions: null }
export const refusedToAgents: AgentReach = { kind: "refused" }

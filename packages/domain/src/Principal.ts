import { Context, Schema } from "effect"
import { UserId, WorkspaceId } from "./Ids.ts"
import { AREA_IDS, SPECIAL_IDS } from "./Permissions.ts"

const Level = Schema.Literals([0, 1, 2, 3])

/**
 * A role as the session carries it: the levels, specials, limit and stores of the role the principal held when the
 * request started, with the role's version so a stale copy is re-read (domain.md §2.4). Here rather than beside the
 * catalogue, so `Permissions.ts` stays free of imports and the console can read it without bundling Schema.
 */
export const RoleSnapshot = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  version: Schema.Int,
  levels: Schema.Record(Schema.Literals(AREA_IDS), Level),
  specials: Schema.Record(Schema.Literals(SPECIAL_IDS), Schema.Boolean),
  refundLimit: Schema.NullOr(Schema.Finite),
  stores: Schema.Union([Schema.Literal("all"), Schema.Array(Schema.String)])
})
export type RoleSnapshot = typeof RoleSnapshot.Type

/** Who is acting (domain.md §1, principal refs). `insyte` drafts but never changes anything, so it is no principal. */
export const PrincipalKind = Schema.Literals([
  "member",
  "supplier_contact",
  "affiliate",
  "api_key",
  "service_account",
  "agent",
  "system"
])
export type PrincipalKind = typeof PrincipalKind.Type

export const Principal = Schema.Struct({
  kind: PrincipalKind,
  /** The member, contact, key or account id. */
  id: Schema.String,
  userId: Schema.NullOr(UserId),
  workspaceId: WorkspaceId,
  /** The supplier or affiliate a partner principal belongs to. */
  partnerId: Schema.NullOr(Schema.String),
  /** The role at request time. */
  role: RoleSnapshot,
  /** `null` is every store. */
  storeScope: Schema.NullOr(Schema.Array(Schema.String))
})
export type Principal = typeof Principal.Type

/** Provided by the auth middleware. A use case reads the workspace from here, never from its input. */
export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()("domain/CurrentPrincipal") {}

/** For background work (a queue, a Workflow step, a cron fan-out) that resolved its workspace by routing. */
export class CurrentWorkspace extends Context.Service<CurrentWorkspace, { readonly id: WorkspaceId }>()(
  "domain/CurrentWorkspace"
) {}
